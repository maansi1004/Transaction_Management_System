
require("dotenv").config();

const mongoose = require("mongoose");
const Account = require("../models/account.model");
const Ledger = require("../models/ledger.model");

async function migrateAccountBalances() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    // Do not initialize balances if ledger history already exists.
    const ledgerCount = await Ledger.countDocuments();

    if (ledgerCount > 0) {
      throw new Error(
        "Ledger entries exist. Reconcile balances before migrating."
      );
    }

    const result = await Account.updateMany(
      { balanceMinor: { $exists: false } },
      { $set: { balanceMinor: 0 } },
      { runValidators: true }
    );

    console.log(`Matched accounts: ${result.matchedCount}`);
    console.log(`Updated accounts: ${result.modifiedCount}`);
  } catch (error) {
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

migrateAccountBalances();
