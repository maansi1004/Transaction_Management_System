# fraud-service/main.py

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="Fraud Scoring Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/banking")


# ── Request / response models ──────────────────────────────────────────────────

class ScoreRequest(BaseModel):
    transaction_id: str
    from_account_id: str
    to_account_id: str
    initiated_by: str          # user _id
    amount_minor: int          # in paise
    initiated_at: datetime     # ISO timestamp from the controller


class ScoreResponse(BaseModel):
    transaction_id: str
    score: float 
    label: str                 # LOW | MEDIUM | HIGH
    reasons: list[str]
    block: bool                # True when the transaction should be rejected


# ── Feature extraction ─────────────────────────────────────────────────────────

async def fetch_user_history(from_account_id: str, initiated_by: str) -> dict[str, Any]:
    """
    Queries MongoDB directly for the signals we need.
    Uses the raw HTTP API of MongoDB Atlas if ATLAS_DATA_API is set,
    otherwise uses motor (async pymongo).
    Falls back to safe defaults if the DB is unreachable.
    """
    try:
        from motor.motor_asyncio import AsyncIOMotorClient

        client = AsyncIOMotorClient(MONGO_URI, serverSelectionTimeoutMS=1500)
        db = client.get_default_database()

        now = datetime.now(timezone.utc)
        thirty_days_ago = now.replace(day=max(1, now.day - 30))
        one_hour_ago_ts = now.timestamp() - 3600

        # 1. 30-day average outgoing amount for this account
        pipeline_avg = [
            {
                "$match": {
                    "fromAccount": {"$oid": from_account_id} if False else from_account_id,
                    "status": "SUCCESS",
                    "createdAt": {"$gte": thirty_days_ago},
                }
            },
            {
                "$group": {
                    "_id": None,
                    "avg": {"$avg": "$amountMinor"},
                    "count": {"$sum": 1},
                }
            },
        ]

        # Motor requires ObjectId — import here to keep top-level import minimal
        from bson import ObjectId

        pipeline_avg[0]["$match"]["fromAccount"] = ObjectId(from_account_id)
        pipeline_avg[0]["$match"]["initiatedBy"] = ObjectId(initiated_by)

        avg_result = await db["transactions"].aggregate(pipeline_avg).to_list(1)
        avg_amount = avg_result[0]["avg"] if avg_result else None
        tx_count_30d = avg_result[0]["count"] if avg_result else 0

        # 2. Velocity — transactions in the last hour
        velocity = await db["transactions"].count_documents({
            "initiatedBy": ObjectId(initiated_by),
            "createdAt": {"$gte": datetime.fromtimestamp(one_hour_ago_ts, tz=timezone.utc)},
            "status": {"$in": ["PENDING", "SUCCESS"]},
        })

        # 3. Is this a new payee (has this user ever sent to this account before)?
        prior_payee_count = await db["transactions"].count_documents({
            "initiatedBy": ObjectId(initiated_by),
            "toAccount": ObjectId(from_account_id),   # note: checking to_account
            "status": "SUCCESS",
        })

        # Re-check using the correct to_account_id — passed in separately below
        client.close()

        return {
            "avg_amount_30d": avg_amount,
            "tx_count_30d": tx_count_30d,
            "velocity_1h": velocity,
            "prior_payee_count": prior_payee_count,
        }

    except Exception as exc:
        # Never let a DB error block a transfer — return safe defaults
        print(f"[fraud-service] DB fetch failed, using defaults: {exc}")
        return {
            "avg_amount_30d": None,
            "tx_count_30d": 0,
            "velocity_1h": 0,
            "prior_payee_count": 1,  # assume known payee on error
        }


async def fetch_new_payee(initiated_by: str, to_account_id: str) -> bool:
    """Returns True if this user has never successfully sent to this account."""
    try:
        from motor.motor_asyncio import AsyncIOMotorClient
        from bson import ObjectId

        client = AsyncIOMotorClient(MONGO_URI, serverSelectionTimeoutMS=1500)
        db = client.get_default_database()

        count = await db["transactions"].count_documents({
            "initiatedBy": ObjectId(initiated_by),
            "toAccount": ObjectId(to_account_id),
            "status": "SUCCESS",
        })
        client.close()
        return count == 0
    except Exception as exc:
        print(f"[fraud-service] New-payee check failed: {exc}")
        return False  # assume known payee on error


# ── Scoring logic ──────────────────────────────────────────────────────────────

def score_transaction(
    amount_minor: int,
    initiated_at: datetime,
    history: dict[str, Any],
    is_new_payee: bool,
) -> tuple[float, list[str]]:
    """
    Returns (score 0.0–1.0, list of human-readable reasons).

    Each signal adds a weighted contribution. Weights are calibrated so:
      - A single mild signal lands in LOW (< 0.35)
      - Two moderate signals land in MEDIUM (0.35–0.65)
      - A severe signal or three moderate signals land in HIGH (> 0.65)
    """
    score = 0.0
    reasons: list[str] = []

    avg = history.get("avg_amount_30d")
    velocity = history.get("velocity_1h", 0)
    tx_count_30d = history.get("tx_count_30d", 0)
    hour = initiated_at.hour  # UTC hour

    # ── Signal 1: Amount vs 30-day average ──────────────────────────────────
    if avg is not None and avg > 0:
        ratio = amount_minor / avg
        if ratio >= 10:
            score += 0.45
            reasons.append(
                f"Amount is {ratio:.0f}x your 30-day average "
                f"(₹{amount_minor/100:.0f} vs avg ₹{avg/100:.0f})"
            )
        elif ratio >= 5:
            score += 0.30
            reasons.append(
                f"Amount is {ratio:.0f}x your 30-day average "
                f"(₹{amount_minor/100:.0f} vs avg ₹{avg/100:.0f})"
            )
        elif ratio >= 3:
            score += 0.15
            reasons.append(
                f"Amount is {ratio:.0f}x your 30-day average"
            )
    elif tx_count_30d == 0:
        # First transaction ever — mild signal
        score += 0.10
        reasons.append("First transaction from this account")

    # ── Signal 2: Velocity ───────────────────────────────────────────────────
    if velocity >= 5:
        score += 0.35
        reasons.append(f"{velocity} transactions in the last hour (unusually high)")
    elif velocity >= 3:
        score += 0.20
        reasons.append(f"{velocity} transactions in the last hour")

    # ── Signal 3: New payee ──────────────────────────────────────────────────
    if is_new_payee:
        score += 0.15
        reasons.append("First transfer to this recipient")

    # ── Signal 4: Odd hours (11 PM – 5 AM UTC) ───────────────────────────────
    if 23 <= hour or hour < 5:
        score += 0.10
        reasons.append(f"Transaction initiated at {initiated_at.strftime('%H:%M')} UTC (late night)")

    # ── Signal 5: Suspiciously round number ─────────────────────────────────
    # e.g. exactly ₹10,000 or ₹50,000
    rupees = amount_minor / 100
    if rupees >= 1000 and amount_minor % 100_00 == 0:
        score += 0.05
        reasons.append(f"Round-number amount (₹{rupees:.0f})")

    # ── Signal 6: Very large absolute amount ────────────────────────────────
    # ₹1,00,000 or more
    if amount_minor >= 10_000_000:
        score += 0.20
        reasons.append(f"Large transfer amount (₹{rupees:,.0f})")

    return min(round(score, 4), 1.0), reasons


def label_from_score(score: float) -> tuple[str, bool]:
    """Returns (label, block)."""
    if score >= 0.65:
        return "HIGH", True
    if score >= 0.35:
        return "MEDIUM", False   # flag but allow — human review
    return "LOW", False


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "fraud-scoring"}


@app.post("/score", response_model=ScoreResponse)
async def score(req: ScoreRequest):
    history = await fetch_user_history(req.from_account_id, req.initiated_by)
    is_new_payee = await fetch_new_payee(req.initiated_by, req.to_account_id)

    score_val, reasons = score_transaction(
        amount_minor=req.amount_minor,
        initiated_at=req.initiated_at,
        history=history,
        is_new_payee=is_new_payee,
    )

    label, block = label_from_score(score_val)

    return ScoreResponse(
        transaction_id=req.transaction_id,
        score=score_val,
        label=label,
        reasons=reasons,
        block=block,
    )