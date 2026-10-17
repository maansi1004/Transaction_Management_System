
const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
    {
        fromAccount: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Account",
            required: [true, "Source account is required"],
            index: true,
        },

        toAccount: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Account",
            required: [true, "Destination account is required"],
            index: true,
        },

        // Amount stored in minor currency units (paise).
        // Example: ₹500.00 = 50000 paise.
        amountMinor: {
            type: Number,
            required: [true, "Transaction amount is required"],
            min: [1, "Amount must be greater than zero"],
            validate: {
                validator: Number.isSafeInteger,
                message: "Amount must be a safe integer",
            },
        },

        status: {
            type: String,
            enum: ["PENDING", "SUCCESS", "FAILED", "REVERSED"],
            default: "PENDING",
            required: true,
        },

        // Unique per initiating user, enforced by the compound index below.
        idempotencyKey: {
            type: String,
            required: [true, "Idempotency key is required"],
            trim: true,
            minlength: 16,
            maxlength: 128,
        },

        // Set from the authenticated user's ID on the server.
        initiatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        // Hash of the normalized request parameters.
        // Used to detect reuse of a key with different transfer details.
        requestHash: {
            type: String,
            required: true,
            select: false,
        },

        // Links a reversal transaction to the original transaction.
        reversesTransaction: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Transaction",
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

// Prevent duplicate idempotency keys for the same initiating user.
transactionSchema.index(
    { initiatedBy: 1, idempotencyKey: 1 },
    { unique: true }
);

// Support account transaction history queries.
transactionSchema.index({ fromAccount: 1, createdAt: -1 });
transactionSchema.index({ toAccount: 1, createdAt: -1 });

// Prevent more than one reversal transaction for the same original transaction.
transactionSchema.index(
    { reversesTransaction: 1 },
    {
        unique: true,
        partialFilterExpression: {
            reversesTransaction: { $type: "objectId" },
        },
    }
);

const Transaction = mongoose.model("Transaction", transactionSchema);

module.exports = Transaction;
