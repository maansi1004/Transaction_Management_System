// src/controllers/auth.controller.js

const crypto = require("crypto");
const userModel = require("../models/user.model");
const jwt = require("jsonwebtoken");
const emailService = require("../services/email.service");
const tokenBlackListModel = require("../models/blackList.model");

function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function issueTokenCookie(res, userId) {
    const token = jwt.sign(
        { userId: String(userId) },
        process.env.JWT_SECRET,
        { expiresIn: "3d" }
    );

    // httpOnly  — JS cannot read this cookie (XSS protection)
    // secure    — only sent over HTTPS
    // sameSite  — blocks cross-site request forgery
    res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 3 * 24 * 60 * 60 * 1000, // 3 days in ms
    });

    return token;
}

/*
 * POST /api/auth/register
 */
async function userRegisterController(req, res, next) {
    try {
        const { email, password, name } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({ message: "email, password and name are required" });
        }

        const isExists = await userModel.findOne({ email });

        if (isExists) {
            return res.status(422).json({
                message: "User already exists with this email",
                status: "failed",
            });
        }

        const user = await userModel.create({ email, password, name });

        // Fire-and-forget — never let email failure break registration
        emailService.sendRegistrationEmail(user.email, user.name).catch((err) =>
            console.error("Registration email failed:", err.message)
        );

        const token = issueTokenCookie(res, user._id);

        return res.status(201).json({
            user: { _id: user._id, email: user.email, name: user.name },
            token,
        });
    } catch (error) {
        return next(error);
    }
}

/*
 * POST /api/auth/login
 */
async function userLoginController(req, res, next) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "email and password are required" });
        }

        const user = await userModel.findOne({ email }).select("+password");

        if (!user) {
            return res.status(401).json({ message: "Email or password is invalid" });
        }

        const isValidPassword = await user.comparePassword(password);

        if (!isValidPassword) {
            return res.status(401).json({ message: "Email or password is invalid" });
        }

        const token = issueTokenCookie(res, user._id);

        // Login returns 200, not 201 — 201 means a resource was created
        return res.status(200).json({
            user: { _id: user._id, email: user.email, name: user.name },
            token,
        });
    } catch (error) {
        return next(error);
    }
}

/*
 * POST /api/auth/logout
 */
async function userLogoutController(req, res, next) {
    try {
        const token =
            req.cookies?.token ||
            req.headers.authorization?.split(" ")[1];

        if (!token) {
            return res.status(400).json({
                message: "Unauthorized access, please login to continue",
            });
        }

        // BUG FIX: store the hash, not the raw token.
        // The blacklist model has a `tokenHash` field, not a `token` field.
        // Storing the raw token meant the blacklist check in auth middleware
        // never matched, so logout was silently broken.
        const tokenHash = hashToken(token);
        await tokenBlackListModel.create({ tokenHash });

        res.clearCookie("token", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
        });

        return res.status(200).json({ message: "User logged out successfully" });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    userRegisterController,
    userLoginController,
    userLogoutController,
};