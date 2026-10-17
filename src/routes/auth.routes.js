
const express = require("express");
const router = express.Router();

const authController = require("../controllers/auth.controller");
const { authMiddleware } = require("../middleware/auth.middleware");

// POST /api/auth/register
// Register a new user.
router.post(
    "/register",
    authController.userRegisterController
);

// POST /api/auth/login
// Authenticate an existing user.
router.post(
    "/login",
    authController.userLoginController
);

// POST /api/auth/logout
// Revoke the current token and clear the authentication cookie.
router.post(
    "/logout",
    authMiddleware,
    authController.userLogoutController
);

module.exports = router;
