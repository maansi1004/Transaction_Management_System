require("dotenv").config();

const mongoose = require("mongoose");
const crypto = require("crypto");

const User = require("../models/user.model");
const Account = require("../models/account.model");
const Transaction = require("../models/transaction.model");
const Ledger = require("../models/ledger.model");

function parseAmountToMinorUnits(value) {
    if (!/^\d+(\.\d{1,2})?$/.test(value)) {
        throw new Error("Opening balance must be a valid INR amount.");
    }

    const [rupees, paise = ""] = value.split(".");
    const amountMinor = Number(rupees) * 100 + Number(paise.padEnd(2, "0"));

    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
        throw new Error("Opening balance must be a positive safe amount.");
    }

    return amountMinor;
}

async function seedOpeningBalance() {
    let session;

    try {
        if (!process.env.MONGODB_URI) {
            throw new Error("MONGODB_URI is missing from your root .env file.");
        }

        if (!process.env.RECEIVER_EMAIL) {
            throw new Error("Add RECEIVER_EMAIL to your root .env file.");
        }

        const amountMinor = parseAmountToMinorUnits(
            process.env.OPENING_BALANCE_INR || "10000"
        );

        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB.");

        const receiver = await User.findOne({
            email: process.env.RECEIVER_EMAIL.toLowerCase().trim(),
        });

        if (!receiver) {
            throw new Error("Receiver user not found. Check RECEIVER_EMAIL.");
        }

        const receiverAccount = await Account.findOne({
            user: receiver._id,
            status: "ACTIVE",
        });

        if (!receiverAccount) {
            throw new Error("No active account found for the receiver.");
        }

        if (!Number.isSafeInteger(receiverAccount.balanceMinor)) {
            throw new Error("Receiver account balance is invalid or not migrated.");
        }

        // Find or create a dedicated system user.
        let systemUser = await User.findOne({
            systemUser: true,
        }).select("+systemUser");

        if (!systemUser) {
            const systemEmail =
                process.env.SYSTEM_USER_EMAIL || "system@banking.local";

            const existingUser = await User.findOne({ email: systemEmail })
                .select("+systemUser");

            if (existingUser) {
                throw new Error(
                    "SYSTEM_USER_EMAIL already belongs to a non-system user. " +
                    "Choose a different SYSTEM_USER_EMAIL."
                );
            }

            const randomPassword = crypto.randomBytes(32).toString("hex");

            systemUser = await User.create({
                name: "Banking System",
                email: systemEmail,
                password: randomPassword,
                systemUser: true,
            });

            console.log("Created dedicated system user.");
        }

        if (systemUser.systemUser !== true) {
            throw new Error("The configured system user is not privileged.");
        }

        const idempotencyKey = `opening-balance-${receiverAccount._id}`;

        const existingTransaction = await Transaction.findOne({
            initiatedBy: systemUser._id,
            idempotencyKey,
        });

        if (existingTransaction) {
            throw new Error(
                "An opening-balance transaction already exists for this account. " +
                "No additional funds were added."
            );
        }

        const requestHash = crypto
            .createHash("sha256")
            .update(
                `${receiverAccount._id}:${amountMinor}:OPENING_BALANCE`
            )
            .digest("hex");

        session = await mongoose.startSession();

        await session.withTransaction(async () => {
            // Recheck inside the transaction to prevent accidental duplicates.
            const duplicate = await Transaction.findOne({
                initiatedBy: systemUser._id,
                idempotencyKey,
            }).session(session);

            if (duplicate) {
                throw new Error("Opening balance has already been seeded.");
            }

            const account = await Account.findOne({
                _id: receiverAccount._id,
                status: "ACTIVE",
            }).session(session);

            if (!account) {
                throw new Error("Receiver account is no longer active.");
            }

            const newBalanceMinor = account.balanceMinor + amountMinor;

            if (!Number.isSafeInteger(newBalanceMinor)) {
                throw new Error("Resulting balance exceeds the safe integer range.");
            }

            const [transaction] = await Transaction.create(
                [{
                    transactionType: "OPENING_BALANCE",
                    toAccount: account._id,
                    amountMinor,
                    status: "SUCCESS",
                    idempotencyKey,
                    initiatedBy: systemUser._id,
                    requestHash,
                }],
                { session }
            );

            const updatedAccount = await Account.updateOne(
                {
                    _id: account._id,
                    status: "ACTIVE",
                    balanceMinor: account.balanceMinor,
                },
                {
                    $set: { balanceMinor: newBalanceMinor },
                },
                { session, runValidators: true }
            );

            if (updatedAccount.modifiedCount !== 1) {
                throw new Error("Account balance update failed.");
            }

            await Ledger.create(
                [{
                    account: account._id,
                    transaction: transaction._id,
                    type: "CREDIT",
                    amountMinor,
                    balanceAfterMinor: newBalanceMinor,
                }],
                { session }
            );
        });

        console.log("Opening balance seeded successfully.");
        console.log(`Receiver: ${receiver.email}`);
        console.log(`Amount: ₹${(amountMinor / 100).toFixed(2)}`);
        console.log("Transaction, account balance and ledger entry committed.");
    } catch (error) {
        console.error("Opening-balance seed failed:", error.message);
        process.exitCode = 1;
    } finally {
        if (session) await session.endSession();
        await mongoose.disconnect();
    }
}

seedOpeningBalance();