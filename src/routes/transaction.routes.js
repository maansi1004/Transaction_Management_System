
const { Router } = require("express");

const {
    authMiddleware,
    authSystemUserMiddleware,
} = require("../middleware/auth.middleware");

const transactionController = require("../controllers/transaction.controller");

const transactionRoutes = Router();

// POST /api/transactions
// Transfer money between accounts owned by eligible users.
transactionRoutes.post(
    "/",
    authMiddleware,
    transactionController.createTransaction
);

// POST /api/transactions/system/initial-funds
// Transfer funds from an authorized, funded system account.
transactionRoutes.post(
    "/system/initial-funds",
    authSystemUserMiddleware,
    transactionController.createInitialFundsTransaction
);

module.exports = transactionRoutes;
