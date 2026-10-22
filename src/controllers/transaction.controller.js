// src/controllers/transaction.controller.js

const mongoose = require("mongoose");
const crypto = require("crypto");

const Transaction = require("../models/transaction.model");
const Ledger = require("../models/ledger.model");
const Account = require("../models/account.model");
const emailService = require("../services/email.service");

const FRAUD_SERVICE_URL = process.env.FRAUD_SERVICE_URL || "http://localhost:8000";
const FRAUD_SERVICE_TIMEOUT_MS = 2000; // never block a transfer for more than 2s

function httpError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function validateTransferInput({ fromAccount, toAccount, amountMinor, idempotencyKey }) {
    if (!fromAccount || !toAccount || !idempotencyKey ||
        amountMinor === undefined || amountMinor === null) {
        throw httpError(400, "fromAccount, toAccount, amountMinor and idempotencyKey are required");
    }
    if (!mongoose.isValidObjectId(fromAccount) || !mongoose.isValidObjectId(toAccount)) {
        throw httpError(400, "Invalid account ID");
    }
    if (fromAccount === toAccount) {
        throw httpError(400, "Source and destination accounts must differ");
    }
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
        throw httpError(400, "amountMinor must be a positive safe integer in paise");
    }
    if (typeof idempotencyKey !== "string" ||
        idempotencyKey.trim().length < 16 ||
        idempotencyKey.trim().length > 128) {
        throw httpError(400, "Idempotency key must contain 16 to 128 characters");
    }
}

function createRequestHash({ fromAccount, toAccount, amountMinor }) {
    return crypto
        .createHash("sha256")
        .update(JSON.stringify({
            fromAccount: String(fromAccount),
            toAccount: String(toAccount),
            amountMinor,
        }))
        .digest("hex");
}

async function findExistingTransaction(initiatedBy, idempotencyKey) {
    return Transaction.findOne({ initiatedBy, idempotencyKey }).select("+requestHash");
}

function replayResult(existing, requestHash) {
    if (existing.requestHash !== requestHash) {
        throw httpError(409, "This idempotency key was already used for a different request");
    }
    if (existing.status === "SUCCESS" || existing.status === "PENDING") {
        return { transaction: existing, replayed: true };
    }
    throw httpError(
        409,
        `This idempotency key belongs to a transaction with status ${existing.status}. Use a new key.`
    );
}

// ── Fraud scoring ──────────────────────────────────────────────────────────────
// Calls the Python fraud service. Returns a safe default if the service
// is unreachable, so a service outage never blocks a legitimate transfer.

async function scoreFraud({ transactionId, fromAccountId, toAccountId, initiatedBy, amountMinor }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FRAUD_SERVICE_TIMEOUT_MS);

    try {
        const res = await fetch(`${FRAUD_SERVICE_URL}/score`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                transaction_id: String(transactionId),
                from_account_id: String(fromAccountId),
                to_account_id: String(toAccountId),
                initiated_by: String(initiatedBy),
                amount_minor: amountMinor,
                initiated_at: new Date().toISOString(),
            }),
            signal: controller.signal,
        });

        if (!res.ok) {
            console.warn(`[fraud] service returned ${res.status} — allowing transfer`);
            return { score: null, label: null, reasons: [], block: false, serviceUnavailable: true };
        }

        const data = await res.json();
        return {
            score: data.score,
            label: data.label,
            reasons: data.reasons || [],
            block: data.block === true,
            serviceUnavailable: false,
        };
    } catch (err) {
        if (err.name === "AbortError") {
            console.warn("[fraud] service timed out — allowing transfer");
        } else {
            console.warn("[fraud] service unreachable —", err.message);
        }
        return { score: null, label: null, reasons: [], block: false, serviceUnavailable: true };
    } finally {
        clearTimeout(timeout);
    }
}


// ── Transfer execution ─────────────────────────────────────────────────────────

async function getTransactionHistory(req, res, next) {
    try {
        const userId = req.user?._id || req.user?.id;

        if (!userId || !mongoose.isValidObjectId(userId)) {
            return res.status(401).json({
                message: "Unauthorized access, please login to continue",
            });
        }

        const userAccounts = await Account.find({ user: userId }).select("_id").lean();
        const accountIds = userAccounts.map((a) => a._id);

        if (accountIds.length === 0) {
            return res.status(200).json({ transactions: [] });
        }

        const transactions = await Transaction.find({
            $or: [
                { fromAccount: { $in: accountIds } },
                { toAccount: { $in: accountIds } },
            ],
        })
            .select("_id transactionType fromAccount toAccount amountMinor status fraud createdAt updatedAt")
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();

        return res.status(200).json({ transactions });
    } catch (error) {
        next(error);
    }
}

async function executeTransfer({
    initiatedBy, fromAccount, toAccount, amountMinor, idempotencyKey,
}) {
    validateTransferInput({ fromAccount, toAccount, amountMinor, idempotencyKey });

    const normalizedKey = idempotencyKey.trim();
    const requestHash = createRequestHash({ fromAccount, toAccount, amountMinor });

    const existing = await findExistingTransaction(initiatedBy, normalizedKey);
    if (existing) return replayResult(existing, requestHash);

    const session = await mongoose.startSession();
    let result;

    try {
        await session.withTransaction(async () => {
            const source = await Account.findById(fromAccount).session(session);
            const destination = await Account.findById(toAccount).session(session);

            if (!source || !destination) throw httpError(404, "Source or destination account not found");
            if (String(source.user) !== String(initiatedBy)) throw httpError(403, "Not authorized");
            if (source.status !== "ACTIVE" || destination.status !== "ACTIVE") throw httpError(400, "Both accounts must be ACTIVE");
            if (source.currency !== destination.currency) throw httpError(400, "Currencies must match");

            // Create PENDING transaction first so we have an _id for fraud scoring.
            const [transaction] = await Transaction.create(
                [{
                    fromAccount: source._id,
                    toAccount: destination._id,
                    amountMinor,
                    initiatedBy,
                    idempotencyKey: normalizedKey,
                    requestHash,
                    status: "PENDING",
                }],
                { session, ordered: true }
            );

            // ── Fraud check (outside the write path, inside the session) ────────
            // We score before debiting so a HIGH-risk transaction never touches
            // the balance. The session will be aborted if we throw here.
            const fraudResult = await scoreFraud({
                transactionId: transaction._id,
                fromAccountId: source._id,
                toAccountId: destination._id,
                initiatedBy,
                amountMinor,
            });

            // Store the fraud score on the transaction regardless of outcome.
            transaction.fraud = {
                score: fraudResult.score,
                label: fraudResult.label,
                reasons: fraudResult.reasons,
                flagged: fraudResult.label === "MEDIUM" || fraudResult.label === "HIGH",
                scoredAt: new Date(),
            };

            // Block HIGH-risk transfers.
            if (fraudResult.block) {
                transaction.status = "FAILED";
                await transaction.save({ session });
                throw httpError(
                    422,
                    `Transfer blocked by fraud detection. Reason: ${fraudResult.reasons[0] || "high risk score"}`
                );
            }

            // Proceed with the transfer.
            const debitResult = await Account.updateOne(
                {
                    _id: source._id,
                    user: initiatedBy,
                    status: "ACTIVE",
                    balanceMinor: { $gte: amountMinor },
                },
                { $inc: { balanceMinor: -amountMinor } },
                { session }
            );

            if (debitResult.modifiedCount !== 1) {
                throw httpError(400, "Insufficient balance or account no longer active");
            }

            const creditResult = await Account.updateOne(
                { _id: destination._id, status: "ACTIVE", currency: source.currency },
                { $inc: { balanceMinor: amountMinor } },
                { session }
            );

            if (creditResult.modifiedCount !== 1) {
                throw httpError(409, "Destination account changed or no longer eligible");
            }

            const updatedSource = await Account.findById(source._id).session(session);
            const updatedDestination = await Account.findById(destination._id).session(session);

            await Ledger.create(
                [
                    {
                        account: source._id,
                        transaction: transaction._id,
                        type: "DEBIT",
                        amountMinor,
                        balanceAfterMinor: updatedSource.balanceMinor,
                    },
                    {
                        account: destination._id,
                        transaction: transaction._id,
                        type: "CREDIT",
                        amountMinor,
                        balanceAfterMinor: updatedDestination.balanceMinor,
                    },
                ],
                { session, ordered: true }
            );

            transaction.status = "SUCCESS";
            await transaction.save({ session });

            result = { transaction: transaction.toObject(), replayed: false };
        });

        return result;

    } catch (error) {
        if (error.code === 11000) {
            const existingAfterRace = await findExistingTransaction(initiatedBy, normalizedKey);
            if (existingAfterRace) return replayResult(existingAfterRace, requestHash);
        }
        throw error;
    } finally {
        await session.endSession();
    }
}

function sendError(res, next, error) {
    if (error.statusCode) {
        return res.status(error.statusCode).json({ message: error.message });
    }
    return next(error);
}

async function createTransaction(req, res, next) {
    try {
        const { fromAccount, toAccount, amountMinor, idempotencyKey } = req.body;

        const result = await executeTransfer({
            initiatedBy: req.user._id,
            fromAccount,
            toAccount,
            amountMinor,
            idempotencyKey,
        });

        if (!result.replayed) {
            emailService
                .sendTransactionEmail(req.user.email, req.user.name, amountMinor, toAccount)
                .catch((err) =>
                    console.error("Email failed after committed transfer:", err.message)
                );
        }

        const tx = result.transaction;

        // Include fraud info in the response so the frontend can show the badge.
        const responseBody = {
            message: result.replayed
                ? "Transaction already processed"
                : "Transaction completed successfully",
            transaction: tx,
        };

        // Warn the user if the transfer was flagged (MEDIUM) but allowed through.
        if (tx.fraud?.label === "MEDIUM") {
            responseBody.warning =
                "This transfer has been flagged for review. " +
                (tx.fraud.reasons?.[0] || "");
        }

        return res.status(result.replayed ? 200 : 201).json(responseBody);

    } catch (error) {
        return sendError(res, next, error);
    }
}

async function createInitialFundsTransaction(req, res, next) {
    try {
        const { toAccount, amountMinor, idempotencyKey } = req.body;

        if (!toAccount) throw httpError(400, "toAccount is required");
        if (!mongoose.isValidObjectId(toAccount)) throw httpError(400, "Invalid destination account ID");
        if (req.user.systemUser !== true) throw httpError(403, "System-user privileges required");

        const systemAccount = await Account.findOne({ user: req.user._id, status: "ACTIVE" });
        if (!systemAccount) throw httpError(404, "Active system funding account not found");

        const result = await executeTransfer({
            initiatedBy: req.user._id,
            fromAccount: systemAccount._id,
            toAccount,
            amountMinor,
            idempotencyKey,
        });

        return res.status(result.replayed ? 200 : 201).json({
            message: result.replayed
                ? "Funding transaction already processed"
                : "Initial funding transfer completed successfully",
            transaction: result.transaction,
        });
    } catch (error) {
        return sendError(res, next, error);
    }
}

module.exports = {
    createTransaction,
    createInitialFundsTransaction,
    getTransactionHistory,
};