
const mongoose = require("mongoose");
const crypto = require("crypto");

const Transaction = require("../models/transaction.model");
const Ledger = require("../models/ledger.model");
const Account = require("../models/account.model");
const emailService = require("../services/email.service");

function httpError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function validateTransferInput({
    fromAccount,
    toAccount,
    amountMinor,
    idempotencyKey,
}) {
    if (!fromAccount || !toAccount || !idempotencyKey ||
        amountMinor === undefined || amountMinor === null) {
        throw httpError(
            400,
            "fromAccount, toAccount, amountMinor and idempotencyKey are required"
        );
    }

    if (
        !mongoose.isValidObjectId(fromAccount) ||
        !mongoose.isValidObjectId(toAccount)
    ) {
        throw httpError(400, "Invalid account ID");
    }

    if (fromAccount === toAccount) {
        throw httpError(400, "Source and destination accounts must differ");
    }

    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
        throw httpError(
            400,
            "amountMinor must be a positive safe integer in paise"
        );
    }

    if (
        typeof idempotencyKey !== "string" ||
        idempotencyKey.trim().length < 16 ||
        idempotencyKey.trim().length > 128
    ) {
        throw httpError(
            400,
            "Idempotency key must contain 16 to 128 characters"
        );
    }
}

function createRequestHash({ fromAccount, toAccount, amountMinor }) {
    // Hash normalized transfer parameters, not client-supplied user identity.
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
    return Transaction.findOne({
        initiatedBy,
        idempotencyKey,
    });
}

function replayResult(existing, requestHash) {
    if (existing.requestHash !== requestHash) {
        throw httpError(
            409,
            "This idempotency key was already used for a different request"
        );
    }

    if (existing.status === "SUCCESS") {
        return { transaction: existing, replayed: true };
    }

    if (existing.status === "PENDING") {
        return { transaction: existing, replayed: true };
    }

    throw httpError(
        409,
        `This idempotency key belongs to a transaction with status ${existing.status}. Use a new key for a new transfer.`
    );
}

async function executeTransfer({
    initiatedBy,
    fromAccount,
    toAccount,
    amountMinor,
    idempotencyKey,
}) {
    validateTransferInput({
        fromAccount,
        toAccount,
        amountMinor,
        idempotencyKey,
    });

    const normalizedKey = idempotencyKey.trim();
    const requestHash = createRequestHash({
        fromAccount,
        toAccount,
        amountMinor,
    });

    // Fast path for retries after a previously committed transfer.
    const existing = await findExistingTransaction(
        initiatedBy,
        normalizedKey
    );

    if (existing) {
        return replayResult(existing, requestHash);
    }

    const session = await mongoose.startSession();
    let result;

    try {
        await session.withTransaction(async () => {
            // Load both accounts inside the transaction.
            const source = await Account.findById(fromAccount).session(session);
            const destination = await Account.findById(toAccount).session(session);

            if (!source || !destination) {
                throw httpError(404, "Source or destination account not found");
            }

            // The authenticated user must own the source account.
            if (String(source.user) !== String(initiatedBy)) {
                throw httpError(
                    403,
                    "You are not authorized to transfer from this account"
                );
            }

            if (source.status !== "ACTIVE" ||
                destination.status !== "ACTIVE") {
                throw httpError(
                    400,
                    "Both accounts must be ACTIVE"
                );
            }

            if (source.currency !== destination.currency) {
                throw httpError(
                    400,
                    "Source and destination currencies must match"
                );
            }

            // Insert the transaction in the same database transaction.
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
                { session ,ordered:true}
            );

            // Conditional debit prevents overdrawing under concurrency.
            const debitResult = await Account.updateOne(
                {
                    _id: source._id,
                    user: initiatedBy,
                    status: "ACTIVE",
                    balanceMinor: { $gte: amountMinor },
                },
                {
                    $inc: { balanceMinor: -amountMinor },
                },
                { session }
            );

            if (debitResult.modifiedCount !== 1) {
                throw httpError(
                    400,
                    "Insufficient balance or source account is no longer active"
                );
            }

            // Credit the destination only if it is still active.
            const creditResult = await Account.updateOne(
                {
                    _id: destination._id,
                    status: "ACTIVE",
                    currency: source.currency,
                },
                {
                    $inc: { balanceMinor: amountMinor },
                },
                { session }
            );

            if (creditResult.modifiedCount !== 1) {
                throw httpError(
                    409,
                    "Destination account changed or is no longer eligible"
                );
            }

            // Read balances after the updates, within the same transaction.
            const updatedSource = await Account.findById(source._id)
                .session(session);
            const updatedDestination = await Account.findById(destination._id)
                .session(session);

            // Record both sides of the transfer.
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
                { session ,ordered:true}
            );

            transaction.status = "SUCCESS";
            await transaction.save({ session });

            result = {
                transaction: transaction.toObject(),
                replayed: false,
            };
        });

        return result;
    } catch (error) {
        // A concurrent request may have won the unique-key race.
        if (error.code === 11000) {
            const existingAfterRace = await findExistingTransaction(
                initiatedBy,
                normalizedKey
            );

            if (existingAfterRace) {
                return replayResult(existingAfterRace, requestHash);
            }
        }

        throw error;
    } finally {
        await session.endSession();
    }
}

function sendError(res, next, error) {
    if (error.statusCode) {
        return res.status(error.statusCode).json({
            message: error.message,
        });
    }

    return next(error);
}

async function createTransaction(req, res, next) {
    try {
        const { fromAccount, toAccount, amountMinor, idempotencyKey } =
            req.body;

        const result = await executeTransfer({
            initiatedBy: req.user._id,
            fromAccount,
            toAccount,
            amountMinor,
            idempotencyKey,
        });

        // Never let an email failure make a committed transfer appear failed.
        if (!result.replayed) {
            try {
                await emailService.sendTransactionEmail(
                    req.user.email,
                    req.user.name,
                    amountMinor / 100,
                    toAccount
                );
            } catch (emailError) {
                console.error(
                    "Transfer committed, but email notification failed:",
                    emailError.message
                );
            }
        }

        if (result.replayed && result.transaction.status === "PENDING") {
            return res.status(202).json({
                message: "Transaction is still processing",
                transaction: result.transaction,
            });
        }

        return res.status(result.replayed ? 200 : 201).json({
            message: result.replayed
                ? "Transaction already processed"
                : "Transaction completed successfully",
            transaction: result.transaction,
        });
    } catch (error) {
        return sendError(res, next, error);
    }
}

async function createInitialFundsTransaction(req, res, next) {
    try {
        const { toAccount, amountMinor, idempotencyKey } = req.body;

        if (!toAccount) {
            throw httpError(400, "toAccount is required");
        }

        if (!mongoose.isValidObjectId(toAccount)) {
            throw httpError(400, "Invalid destination account ID");
        }

        // This route must use authSystemUserMiddleware.
        if (req.user.systemUser !== true) {
            throw httpError(403, "System-user privileges are required");
        }

        // The system account must already contain real, authorized funds.
        const systemAccount = await Account.findOne({
            user: req.user._id,
            status: "ACTIVE",
        });

        if (!systemAccount) {
            throw httpError(404, "Active system funding account not found");
        }

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
};
