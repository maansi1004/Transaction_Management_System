
const express = require("express");
const router = express.Router();

const {
    authMiddleware,
} = require("../middleware/auth.middleware");

const accountController = require("../controllers/account.controller");

// POST /api/accounts
// Create an account for the logged-in user.
router.post(
    "/",
    authMiddleware,
    accountController.createAccountController
);

// GET /api/accounts
// Get all accounts belonging to the logged-in user.
router.get(
    "/",
    authMiddleware,
    accountController.getAllAccountsController
);

// GET /api/accounts/balance/:accountId
// Get the balance of an account owned by the logged-in user.
router.get(
    "/balance/:accountId",
    authMiddleware,
    accountController.getAccountBalanceController
);

module.exports = router;
