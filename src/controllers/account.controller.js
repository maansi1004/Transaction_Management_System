
const mongoose = require("mongoose");
const Account = require("../models/account.model");

// POST /api/accounts
// Create an account for the authenticated user.
async function createAccountController(req, res, next) {
    try {
        const account = await Account.create({
            user: req.user._id,
            currency: "INR",
            status: "ACTIVE",
            balanceMinor: 0,
        });

        return res.status(201).json({
            message: "Account created successfully",
            account,
        });
    } catch (error) {
        return next(error);
    }
}

// GET /api/accounts
// Return all accounts owned by the authenticated user.
async function getAllAccountsController(req, res, next) {
    try {
        const accounts = await Account.find({
            user: req.user._id,
        }).select("-__v");

        return res.status(200).json({
            accounts,
        });
    } catch (error) {
        return next(error);
    }
}

// GET /api/accounts/:accountId/balance
// Return the balance only if the account belongs to the user.
async function getAccountBalanceController(req, res, next) {
    try {
        const { accountId } = req.params;

        if (!mongoose.isValidObjectId(accountId)) {
            return res.status(400).json({
                message: "Invalid account ID",
            });
        }

        const account = await Account.findOne({
            _id: accountId,
            user: req.user._id,
        });

        if (!account) {
            return res.status(404).json({
                message: "Account not found",
            });
        }

        // Balance is stored in paise, not rupees.
        return res.status(200).json({
            accountId: account._id,
            currency: account.currency,
            balanceMinor: account.balanceMinor,
            balanceRupees: account.balanceMinor / 100,
        });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    createAccountController,
    getAllAccountsController,
    getAccountBalanceController,
};
