// src/scripts/seed-demo.js
//
// Creates two demo users (Alice and Bob), each with an active INR account,
// funded balances, and a realistic transaction history between them.
//
// Safe to re-run — idempotency checks prevent duplicate data.
//
// Usage:
//   node src/scripts/seed-demo.js
//
// Optional env overrides (add to your .env or prefix the command):
//   ALICE_EMAIL      default: alice@demo.com
//   BOB_EMAIL        default: bob@demo.com
//   DEMO_PASSWORD    default: DemoPassword123!
//   ALICE_BALANCE    default: 50000   (₹ rupees)
//   BOB_BALANCE      default: 25000   (₹ rupees)

require("dotenv").config();

const mongoose = require("mongoose");
const crypto   = require("crypto");

const User        = require("../models/user.model");
const Account     = require("../models/account.model");
const Transaction = require("../models/transaction.model");
const Ledger      = require("../models/ledger.model");

// ── Config ────────────────────────────────────────────────────────────────────

const ALICE_EMAIL   = (process.env.ALICE_EMAIL   || "alice@demo.com").toLowerCase().trim();
const BOB_EMAIL     = (process.env.BOB_EMAIL     || "bob@demo.com").toLowerCase().trim();
const DEMO_PASSWORD = process.env.DEMO_PASSWORD  || "DemoPassword123!";

function rupees(amount) {
    // Convert a rupee integer to paise, with a safety check.
    const minor = Math.round(amount) * 100;
    if (!Number.isSafeInteger(minor) || minor <= 0) {
        throw new Error(`Invalid rupee amount: ${amount}`);
    }
    return minor;
}

const ALICE_OPENING = rupees(Number(process.env.ALICE_BALANCE) || 50_000); // ₹50,000
const BOB_OPENING   = rupees(Number(process.env.BOB_BALANCE)   || 25_000); // ₹25,000

// Transaction history to seed between the two accounts.
// Each entry is from Alice's POV: positive = Alice pays Bob, negative = Bob pays Alice.
// Descriptions are used later for categorization.
const TRANSFER_SCRIPT = [
    // 30 days ago
    { daysAgo: 30, fromAlice: true,  amountRupees: 5_000,  note: "Rent share - October" },
    { daysAgo: 28, fromAlice: false, amountRupees: 2_500,  note: "Salary advance" },
    { daysAgo: 25, fromAlice: true,  amountRupees: 800,    note: "Dinner at Barbeque Nation" },
    { daysAgo: 22, fromAlice: false, amountRupees: 1_200,  note: "Grocery split" },
    { daysAgo: 20, fromAlice: true,  amountRupees: 3_500,  note: "Flight tickets - Goa trip" },
    { daysAgo: 18, fromAlice: false, amountRupees: 500,    note: "Coffee and snacks" },
    { daysAgo: 15, fromAlice: true,  amountRupees: 10_000, note: "Freelance project payment" },
    { daysAgo: 12, fromAlice: false, amountRupees: 4_000,  note: "Hotel split - Goa" },
    { daysAgo: 10, fromAlice: true,  amountRupees: 650,    note: "Swiggy order reimbursement" },
    { daysAgo: 8,  fromAlice: false, amountRupees: 2_000,  note: "Electricity bill split" },
    { daysAgo: 6,  fromAlice: true,  amountRupees: 1_500,  note: "Zomato Pro subscription" },
    { daysAgo: 4,  fromAlice: false, amountRupees: 750,    note: "Cab fare split" },
    { daysAgo: 2,  fromAlice: true,  amountRupees: 300,    note: "Tea and breakfast" },
    { daysAgo: 1,  fromAlice: false, amountRupees: 8_000,  note: "Salary reimbursement" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function idempotencyKey(tag) {
    return `seed-demo-${tag}`;
}

function requestHash(fromAccountId, toAccountId, amountMinor) {
    return crypto
        .createHash("sha256")
        .update(JSON.stringify({
            fromAccount: String(fromAccountId),
            toAccount:   String(toAccountId),
            amountMinor,
        }))
        .digest("hex");
}

function daysAgoDate(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    // Randomise the time within business hours so the history looks natural.
    d.setHours(9 + Math.floor(Math.random() * 10));
    d.setMinutes(Math.floor(Math.random() * 60));
    d.setSeconds(Math.floor(Math.random() * 60));
    return d;
}

function log(msg) { console.log(`  ${msg}`); }
function section(msg) { console.log(`\n── ${msg}`); }

// ── Core: create or fetch a user + account pair ───────────────────────────────

async function upsertUserAndAccount(name, email, password, openingMinor, systemUserId) {
    // User
    let user = await User.findOne({ email });
    if (!user) {
        user = await User.create({ name, email, password });
        log(`Created user: ${email}`);
    } else {
        log(`User already exists: ${email}`);
    }

    // Account
    let account = await Account.findOne({ user: user._id, status: "ACTIVE" });
    if (!account) {
        account = await Account.create({
            user: user._id,
            currency: "INR",
            balanceMinor: 0,
            status: "ACTIVE",
        });
        log(`Created account: ${account._id}`);
    } else {
        log(`Account already exists: ${account._id}`);
    }

    // Opening balance — idempotent: skip if already seeded for this account.
    const openingKey = idempotencyKey(`opening-${account._id}`);
    const existingOpening = await Transaction.findOne({
        initiatedBy: systemUserId,
        idempotencyKey: openingKey,
    });

    if (!existingOpening && account.balanceMinor === 0) {
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const rHash = crypto
                    .createHash("sha256")
                    .update(`${account._id}:${openingMinor}:OPENING_BALANCE`)
                    .digest("hex");

                const [tx] = await Transaction.create(
                    [{
                        transactionType: "OPENING_BALANCE",
                        toAccount:       account._id,
                        amountMinor:     openingMinor,
                        status:          "SUCCESS",
                        idempotencyKey:  openingKey,
                        initiatedBy:     systemUserId,
                        requestHash:     rHash,
                        fraud: {
                            score: 0,
                            label: "LOW",
                            reasons: [],
                            flagged: false,
                            scoredAt: new Date(),
                        },
                    }],
                    { session }
                );

                const newBalance = account.balanceMinor + openingMinor;

                const updated = await Account.updateOne(
                    { _id: account._id, status: "ACTIVE", balanceMinor: account.balanceMinor },
                    { $set: { balanceMinor: newBalance } },
                    { session, runValidators: true }
                );

                if (updated.modifiedCount !== 1) {
                    throw new Error(`Balance update failed for account ${account._id}`);
                }

                await Ledger.create(
                    [{
                        account:          account._id,
                        transaction:      tx._id,
                        type:             "CREDIT",
                        amountMinor:      openingMinor,
                        balanceAfterMinor: newBalance,
                    }],
                    { session }
                );

                account.balanceMinor = newBalance;
            });
        } finally {
            await session.endSession();
        }
        log(`Funded ₹${openingMinor / 100} → ${email}`);
    } else if (existingOpening) {
        log(`Opening balance already seeded for: ${email}`);
    } else {
        log(`Account already has balance ₹${account.balanceMinor / 100} — skipping fund`);
    }

    return { user, account };
}

// ── Core: seed one transfer ────────────────────────────────────────────────────

async function seedTransfer({
    fromUser, fromAccount,
    toUser,   toAccount,
    amountMinor, note, createdAt, txIndex,
}) {
    const key = idempotencyKey(`transfer-${txIndex}-${fromAccount._id}`);

    const existing = await Transaction.findOne({
        initiatedBy: fromUser._id,
        idempotencyKey: key,
    });

    if (existing) {
        log(`Transfer #${txIndex + 1} already seeded — skipping`);
        return;
    }

    // Simple rule-based fraud score for seed data (mirrors the Python service).
    function seedFraudScore(amount) {
        if (amount >= rupees(8_000)) return { score: 0.38, label: "MEDIUM", flagged: true,  reasons: ["Large transfer amount for demo account"] };
        if (amount >= rupees(4_000)) return { score: 0.12, label: "LOW",    flagged: false, reasons: [] };
        return                              { score: 0.04, label: "LOW",    flagged: false, reasons: [] };
    }

    const fraud = { ...seedFraudScore(amountMinor), scoredAt: new Date() };

    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const src  = await Account.findOne({ _id: fromAccount._id, status: "ACTIVE" }).session(session);
            const dest = await Account.findOne({ _id: toAccount._id,   status: "ACTIVE" }).session(session);

            if (!src || !dest) throw new Error("Account not found during transfer seed");
            if (src.balanceMinor < amountMinor) {
                throw new Error(
                    `Insufficient balance for transfer #${txIndex + 1}: ` +
                    `have ₹${src.balanceMinor / 100}, need ₹${amountMinor / 100}`
                );
            }

            const rHash = requestHash(src._id, dest._id, amountMinor);

            const [tx] = await Transaction.create(
                [{
                    transactionType: "TRANSFER",
                    fromAccount:     src._id,
                    toAccount:       dest._id,
                    amountMinor,
                    status:          "SUCCESS",
                    idempotencyKey:  key,
                    initiatedBy:     fromUser._id,
                    requestHash:     rHash,
                    fraud,
                    createdAt,
                    updatedAt:       createdAt,
                }],
                { session, ordered: true }
            );

            // Debit source
            const debitResult = await Account.updateOne(
                {
                    _id:           src._id,
                    status:        "ACTIVE",
                    balanceMinor:  { $gte: amountMinor },
                },
                { $inc: { balanceMinor: -amountMinor } },
                { session }
            );
            if (debitResult.modifiedCount !== 1) throw new Error("Debit failed");

            // Credit destination
            const creditResult = await Account.updateOne(
                { _id: dest._id, status: "ACTIVE" },
                { $inc: { balanceMinor: amountMinor } },
                { session }
            );
            if (creditResult.modifiedCount !== 1) throw new Error("Credit failed");

            const updatedSrc  = await Account.findById(src._id).session(session);
            const updatedDest = await Account.findById(dest._id).session(session);

            await Ledger.create(
                [
                    {
                        account:           src._id,
                        transaction:       tx._id,
                        type:              "DEBIT",
                        amountMinor,
                        balanceAfterMinor: updatedSrc.balanceMinor,
                    },
                    {
                        account:           dest._id,
                        transaction:       tx._id,
                        type:              "CREDIT",
                        amountMinor,
                        balanceAfterMinor: updatedDest.balanceMinor,
                    },
                ],
                { session, ordered: true }
            );
        });

        log(`Transfer #${txIndex + 1}: ₹${amountMinor / 100} — ${note}`);
    } finally {
        await session.endSession();
    }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function seed() {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error("MONGODB_URI is missing from your .env file.");
        }

        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 10_000,
        });
        console.log("Connected to MongoDB:", mongoose.connection.name);

        // ── Step 1: System user ──────────────────────────────────────────────
        section("System user");

        let systemUser = await User.findOne({ systemUser: true }).select("+systemUser");
        if (!systemUser) {
            const sysEmail = process.env.SYSTEM_USER_EMAIL || "system@banking.local";
            systemUser = await User.create({
                name:       "Banking System",
                email:      sysEmail,
                password:   crypto.randomBytes(32).toString("hex"),
                systemUser: true,
            });
            log(`Created system user: ${sysEmail}`);
        } else {
            log(`System user exists: ${systemUser.email}`);
        }

        // ── Step 2: Alice ────────────────────────────────────────────────────
        section("Alice");
        const { user: alice, account: aliceAccount } = await upsertUserAndAccount(
            "Alice", ALICE_EMAIL, DEMO_PASSWORD, ALICE_OPENING, systemUser._id
        );

        // ── Step 3: Bob ──────────────────────────────────────────────────────
        section("Bob");
        const { user: bob, account: bobAccount } = await upsertUserAndAccount(
            "Bob", BOB_EMAIL, DEMO_PASSWORD, BOB_OPENING, systemUser._id
        );

        // ── Step 4: Transaction history ──────────────────────────────────────
        section("Transaction history");

        for (let i = 0; i < TRANSFER_SCRIPT.length; i++) {
            const entry = TRANSFER_SCRIPT[i];
            const amountMinor = rupees(entry.amountRupees);

            await seedTransfer({
                fromUser:    entry.fromAlice ? alice : bob,
                fromAccount: entry.fromAlice ? aliceAccount : bobAccount,
                toUser:      entry.fromAlice ? bob   : alice,
                toAccount:   entry.fromAlice ? bobAccount : aliceAccount,
                amountMinor,
                note:        entry.note,
                createdAt:   daysAgoDate(entry.daysAgo),
                txIndex:     i,
            });
        }

        // ── Step 5: Summary ──────────────────────────────────────────────────
        section("Done");

        const finalAlice = await Account.findById(aliceAccount._id);
        const finalBob   = await Account.findById(bobAccount._id);
        const txCount    = await Transaction.countDocuments({
            $or: [
                { fromAccount: aliceAccount._id },
                { fromAccount: bobAccount._id },
            ],
            transactionType: "TRANSFER",
        });

        console.log(`
┌─────────────────────────────────────────────┐
│              Seed complete                  │
├────────────┬────────────────┬───────────────┤
│ User       │ Email          │ Balance       │
├────────────┼────────────────┼───────────────┤
│ Alice      │ ${ALICE_EMAIL.padEnd(14)} │ ₹${String(finalAlice.balanceMinor / 100).padStart(11)} │
│ Bob        │ ${BOB_EMAIL.padEnd(14)} │ ₹${String(finalBob.balanceMinor / 100).padStart(11)} │
├────────────┴────────────────┴───────────────┤
│ Password: ${DEMO_PASSWORD.padEnd(33)} │
│ Transfers seeded: ${String(txCount).padEnd(25)} │
└─────────────────────────────────────────────┘
        `);

    } catch (error) {
        console.error("\nSeed failed:", error.message);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB.");
    }
}

seed();