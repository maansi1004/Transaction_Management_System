
const mongoose = require("mongoose");

const ledgerSchema = new mongoose.Schema(
  {
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      immutable: true,
      index: true,
    },

    transaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      required: true,
      immutable: true,
    },

    type: {
      type: String,
      enum: ["CREDIT", "DEBIT"],
      required: true,
      immutable: true,
    },

    amountMinor: {
      type: Number,
      required: true,
      min: 1,
      immutable: true,
      validate: {
        validator: Number.isSafeInteger,
        message: "Ledger amount must be a safe integer",
      },
    },

    balanceAfterMinor: {
      type: Number,
      required: true,
      min: 0,
      immutable: true,
      validate: {
        validator: Number.isSafeInteger,
        message: "Balance must be a safe integer",
      },
    },
  },
  { timestamps: true }
);

// Prevent normal Mongoose query operations from modifying ledger history.
function preventLedgerModification() {
  throw new Error("Ledger entries cannot be modified or deleted");
}

ledgerSchema.pre("updateOne", preventLedgerModification);
ledgerSchema.pre("updateMany", preventLedgerModification);
ledgerSchema.pre("findOneAndUpdate", preventLedgerModification);
ledgerSchema.pre("replaceOne", preventLedgerModification);
ledgerSchema.pre("findOneAndReplace", preventLedgerModification);
ledgerSchema.pre("deleteOne", preventLedgerModification);
ledgerSchema.pre("deleteMany", preventLedgerModification);
ledgerSchema.pre("findOneAndDelete", preventLedgerModification);

ledgerSchema.index(
  { transaction: 1, type: 1 },
  { unique: true }
);

ledgerSchema.index({ account: 1, createdAt: -1 });

const Ledger = mongoose.model("Ledger", ledgerSchema);

module.exports = Ledger;
