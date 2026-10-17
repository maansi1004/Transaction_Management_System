
const userModel = require("../models/user.model");
const TokenBlacklist = require("../models/blackList.model");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

function getToken(req) {
    // Prefer the HttpOnly cookie when present.
    if (req.cookies?.token) {
        return req.cookies.token;
    }

    // Otherwise accept: Authorization: Bearer <token>
    const authHeader = req.headers.authorization;

    if (authHeader) {
        const parts = authHeader.split(" ");

        if (
            parts.length === 2 &&
            parts[0].toLowerCase() === "bearer" &&
            parts[1]
        ) {
            return parts[1];
        }
    }

    return null;
}

function hashToken(token) {
    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
}

async function authenticate(req, res, next, requireSystemUser = false) {
    const token = getToken(req);

    if (!token) {
        return res.status(401).json({
            message: "Unauthorized access, please login to continue",
        });
    }

    if (!process.env.JWT_SECRET) {
        return next(new Error("JWT_SECRET is not configured"));
    }

    let decoded;

    // Verify signature and expiry before trusting token contents.
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        return res.status(401).json({
            message: "Unauthorized access, please login to continue",
        });
    }

    if (
        !decoded ||
        typeof decoded !== "object" ||
        typeof decoded.userId !== "string"
    ) {
        return res.status(401).json({
            message: "Unauthorized access, please login to continue",
        });
    }

    try {
        const tokenHash = hashToken(token);

        // The blacklist model stores tokenHash, not the raw JWT.
        const isBlacklisted = await TokenBlacklist.exists({ tokenHash });

        if (isBlacklisted) {
            return res.status(401).json({
                message: "Unauthorized access, please login to continue",
            });
        }

        let userQuery = userModel.findById(decoded.userId);

        if (requireSystemUser) {
            userQuery = userQuery.select("+systemUser");
        }

        const user = await userQuery;

        if (!user) {
            return res.status(401).json({
                message: "Unauthorized access, please login to continue",
            });
        }

        if (requireSystemUser && user.systemUser !== true) {
            return res.status(403).json({
                message: "Forbidden: system-user privileges are required",
            });
        }

        req.user = user;
        return next();
    } catch (err) {
        // Database or unexpected errors should reach Express error handling.
        return next(err);
    }
}

// Protect routes that require a logged-in user.
function authMiddleware(req, res, next) {
    return authenticate(req, res, next, false);
}

// Protect routes restricted to a system user.
function authSystemUserMiddleware(req, res, next) {
    return authenticate(req, res, next, true);
}

module.exports = {
    authMiddleware,
    authSystemUserMiddleware,
};
