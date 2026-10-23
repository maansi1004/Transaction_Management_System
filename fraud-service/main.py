# fraud-service/main.py

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# MONGO_URI = os.getenv("MONGO_URI", "")
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

MONGO_URI = os.getenv("MONGO_URI", "").strip()

# ── Single application-level Motor client ─────────────────────────────────────
# Created once on startup, closed on shutdown.
# Fixes: one client per request, two clients per score call.

_motor_client = None
_db = None


def get_db():
    if _db is None:
        raise RuntimeError("Database not initialised. Check MONGO_URI.")
    return _db


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _motor_client, _db

    if not MONGO_URI:
        raise RuntimeError(
            "MONGO_URI is not set. Add it to fraud-service/.env or your environment."
        )

    try:
        from motor.motor_asyncio import AsyncIOMotorClient
        _motor_client = AsyncIOMotorClient(MONGO_URI, serverSelectionTimeoutMS=3000)
        # Trigger a real connection check on startup so we know immediately if
        # the URI or database name is wrong.
        await _motor_client.admin.command("ping")
        _db = _motor_client.get_default_database()
        print(f"[fraud-service] Connected to MongoDB: {_db.name}")
    except Exception as exc:
        print(f"[fraud-service] STARTUP ERROR — MongoDB connection failed: {exc}")
        raise

    yield  # app runs here

    if _motor_client is not None:
        _motor_client.close()
        print("[fraud-service] MongoDB client closed.")


app = FastAPI(title="Fraud Scoring Service", version="1.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type"],
)


# ── Request / response models ──────────────────────────────────────────────────

class ScoreRequest(BaseModel):
    transaction_id: str
    from_account_id: str
    to_account_id: str
    initiated_by: str
    amount_minor: int
    initiated_at: datetime


class ScoreResponse(BaseModel):
    transaction_id: str
    score: float
    label: str          # LOW | MEDIUM | HIGH
    reasons: list[str]
    block: bool
    history_available: bool   # False when DB was unreachable — caller should note this


# ── Feature extraction ─────────────────────────────────────────────────────────

async def fetch_user_history(
    from_account_id: str,
    initiated_by: str,
) -> dict[str, Any]:
    """
    Returns behavioural features for the sender.
    Returns history_available=False when the DB is unreachable so the
    caller can treat the score as advisory rather than definitive.
    """
    from bson import ObjectId

    db = get_db()
    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)   # fix: was using .replace(day=...)
    one_hour_ago    = now - timedelta(hours=1)

    try:
        from_account_oid  = ObjectId(from_account_id)
        initiated_by_oid  = ObjectId(initiated_by)
    except Exception:
        return {"avg_amount_30d": None, "tx_count_30d": 0,
                "velocity_1h": 0, "history_available": False}

    try:
        # 30-day outgoing average and count for this account
        pipeline = [
            {
                "$match": {
                    "fromAccount": from_account_oid,
                    "initiatedBy": initiated_by_oid,
                    "status": "SUCCESS",
                    "createdAt": {"$gte": thirty_days_ago},
                }
            },
            {
                "$group": {
                    "_id": None,
                    "avg":   {"$avg": "$amountMinor"},
                    "count": {"$sum": 1},
                }
            },
        ]

        avg_result   = await db["transactions"].aggregate(pipeline).to_list(1)
        avg_amount   = avg_result[0]["avg"]   if avg_result else None
        tx_count_30d = avg_result[0]["count"] if avg_result else 0

        # Velocity: how many transfers this user sent in the last hour
        velocity = await db["transactions"].count_documents({
            "initiatedBy": initiated_by_oid,
            "createdAt":   {"$gte": one_hour_ago},
            "status":      {"$in": ["PENDING", "SUCCESS"]},
        })

        return {
            "avg_amount_30d":    avg_amount,
            "tx_count_30d":      tx_count_30d,
            "velocity_1h":       velocity,
            "history_available": True,
        }

    except Exception as exc:
        print(f"[fraud-service] fetch_user_history failed: {exc}")
        # Fix: return an explicit flag so the scorer knows data was missing.
        return {
            "avg_amount_30d":    None,
            "tx_count_30d":      0,
            "velocity_1h":       0,
            "history_available": False,
        }


async def fetch_new_payee(initiated_by: str, to_account_id: str) -> tuple[bool, bool]:
    """
    Returns (is_new_payee, check_available).
    check_available=False means the DB was unreachable — treat as unknown,
    not as a known payee (fixes: error was returning False = known payee).
    """
    from bson import ObjectId

    db = get_db()

    try:
        count = await db["transactions"].count_documents({
            "initiatedBy": ObjectId(initiated_by),
            "toAccount":   ObjectId(to_account_id),   # fix: was using from_account_id
            "status":      "SUCCESS",
        })
        return count == 0, True

    except Exception as exc:
        print(f"[fraud-service] fetch_new_payee failed: {exc}")
        # Fix: unknown, not known — don't let a DB error suppress a new-payee signal.
        return False, False


# ── Scoring ────────────────────────────────────────────────────────────────────

def score_transaction(
    amount_minor: int,
    initiated_at: datetime,
    history: dict[str, Any],
    is_new_payee: bool,
    payee_check_available: bool,
    history_available: bool,
) -> tuple[float, list[str]]:
    """
    Returns (score 0.0–1.0, reasons).

    Thresholds:
      LOW    < 0.35  — allow silently
      MEDIUM 0.35–0.64 — allow, flag for review
      HIGH   >= 0.65 — block

    Scoring is advisory when history_available=False.
    """
    score   = 0.0
    reasons: list[str] = []

    avg          = history.get("avg_amount_30d")
    velocity     = history.get("velocity_1h", 0)
    tx_count_30d = history.get("tx_count_30d", 0)

    # Use UTC+5:30 hour for India — avoid flagging normal Indian business hours as "late night"
    ist_offset  = timedelta(hours=5, minutes=30)
    local_hour  = (initiated_at + ist_offset).hour

    # ── Signal 1: Amount vs 30-day average ──────────────────────────────────
    if avg is not None and avg > 0:
        ratio = amount_minor / avg
        if ratio >= 10:
            score += 0.45
            reasons.append(
                f"Amount is {ratio:.0f}x your 30-day average "
                f"(₹{amount_minor/100:,.0f} vs avg ₹{avg/100:,.0f})"
            )
        elif ratio >= 5:
            score += 0.30
            reasons.append(
                f"Amount is {ratio:.0f}x your 30-day average "
                f"(₹{amount_minor/100:,.0f} vs avg ₹{avg/100:,.0f})"
            )
        elif ratio >= 3:
            score += 0.15
            reasons.append(
                f"Amount is {ratio:.0f}x your 30-day average"
            )
    elif tx_count_30d == 0 and history_available:
        # Only fire "first transaction" when history WAS available but empty.
        # Fixes: missing data must not be treated as a genuine first transaction.
        score += 0.10
        reasons.append("First outgoing transaction from this account")

    # ── Signal 2: Velocity ───────────────────────────────────────────────────
    if velocity >= 5:
        score += 0.35
        reasons.append(f"{velocity} transfers in the last hour (unusually high)")
    elif velocity >= 3:
        score += 0.20
        reasons.append(f"{velocity} transfers in the last hour")

    # ── Signal 3: New payee ──────────────────────────────────────────────────
    # Only fire when the check actually succeeded (payee_check_available=True).
    if is_new_payee and payee_check_available:
        score += 0.15
        reasons.append("First transfer to this recipient")

    # ── Signal 4: Odd hours (11 PM – 5 AM IST) ──────────────────────────────
    if 23 <= local_hour or local_hour < 5:
        score += 0.10
        reasons.append(
            f"Transfer at {local_hour:02d}:00 IST (late night)"
        )

    # ── Signal 5: Round number ───────────────────────────────────────────────
    # Fix: was % 100_00 (₹100 multiples). Now % 100_000 (₹1,000 multiples).
    # Only fires for amounts ≥ ₹10,000 to avoid false positives on small round amounts.
    rupees = amount_minor / 100
    if rupees >= 10_000 and amount_minor % 100_000 == 0:
        score += 0.05
        reasons.append(f"Round-number amount (₹{rupees:,.0f})")

    # ── Signal 6: Large absolute amount (≥ ₹1,00,000) ───────────────────────
    if amount_minor >= 10_000_000:
        score += 0.20
        reasons.append(f"Large transfer (₹{rupees:,.0f})")

    return min(round(score, 4), 1.0), reasons


def label_from_score(score: float) -> tuple[str, bool]:
    """Returns (label, block). block=True only for HIGH."""
    if score >= 0.65:
        return "HIGH", True
    if score >= 0.35:
        return "MEDIUM", False
    return "LOW", False


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    db = get_db()
    try:
        await db.command("ping")
        db_status = "connected"
    except Exception:
        db_status = "unreachable"
    return {"status": "ok", "service": "fraud-scoring", "db": db_status}


@app.post("/score", response_model=ScoreResponse)
async def score(req: ScoreRequest):
    history = await fetch_user_history(req.from_account_id, req.initiated_by)
    is_new_payee, payee_check_available = await fetch_new_payee(
        req.initiated_by, req.to_account_id
    )

    score_val, reasons = score_transaction(
        amount_minor=req.amount_minor,
        initiated_at=req.initiated_at,
        history=history,
        is_new_payee=is_new_payee,
        payee_check_available=payee_check_available,
        history_available=history["history_available"],
    )

    label, block = label_from_score(score_val)

    # When history was unavailable, downgrade block to advisory —
    # never hard-block a transfer based on missing data alone.
    if not history["history_available"] and block:
        block = False
        reasons.append("⚠️ Risk assessment based on limited data — manual review advised")

    return ScoreResponse(
        transaction_id=req.transaction_id,
        score=score_val,
        label=label,
        reasons=reasons,
        block=block,
        history_available=history["history_available"],
    )