
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
      required: true,
      default: "INR",
      uppercase: true,
      trim: true,
      enum: ["INR"],
    },

    // Cached balance, maintained atomically with ledger entries.
    balanceMinor: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: "Balance must be a safe integer",
      },
    },
  },
  { timestamps: true }
);

accountSchema.index({ user: 1, status: 1 });

// Calculate the ledger-derived balance for reconciliation.
accountSchema.methods.getBalance = async function (session = null) {
  const pipeline = [
    { $match: { account: this._id } },
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
  ];

  let aggregation = Ledger.aggregate(pipeline);

  if (session) {
    aggregation = aggregation.session(session);
  }

  const result = await aggregation;
  return result.length === 0 ? 0 : result[0].balanceMinor;
};

const Account = mongoose.model("Account", accountSchema);

module.exports = Account;
