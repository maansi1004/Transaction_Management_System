
const mongoose = require("mongoose");
const Ledger = require("./ledger.model");

const accountSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Account must be associated with a user"],
            index: true,
        },

        status: {
            type: String,
            enum: ["ACTIVE", "FROZEN", "CLOSED"],
            default: "ACTIVE",
            required: true,
        },

        currency: {
            type: String,
            required: [true, "Currency is required"],
            default: "INR",
            uppercase: true,
            trim: true,
            enum: ["INR"],
        },
    },
    {
        timestamps: true,
    }
);

// Supports queries for a user's accounts filtered by status.
accountSchema.index({ user: 1, status: 1 });

// Calculate the balance from immutable ledger entries.
// CREDIT increases the balance; DEBIT decreases it.
accountSchema.methods.getBalance = async function () {
    const balanceData = await Ledger.aggregate([
        {
            $match: {
                account: this._id,
            },
        },
        {
            $group: {
                _id: null,
                totalCredits: {
                    $sum: {
                        $cond: [
                            { $eq: ["$type", "CREDIT"] },
                            "$amountMinor",
                            0,
                        ],
                    },
                },
                totalDebits: {
                    $sum: {
                        $cond: [
                            { $eq: ["$type", "DEBIT"] },
                            "$amountMinor",
                            0,
                        ],
                    },
                },
            },
        },
        {
            $project: {
                _id: 0,
                balanceMinor: {
                    $subtract: ["$totalCredits", "$totalDebits"],
                },
            },
        },
    ]);

    // Accounts with no ledger entries have a zero balance.
    if (balanceData.length === 0) {
        return 0;
    }

    return balanceData[0].balanceMinor;
};

const Account = mongoose.model("Account", accountSchema);

module.exports = Account;
