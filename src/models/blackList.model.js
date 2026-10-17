
const mongoose = require("mongoose");

const tokenBlacklistSchema = new mongoose.Schema(
    {
        // Store a SHA-256 hash of the JWT rather than the raw token.
        tokenHash: {
            type: String,
            required: [true, "Token hash is required"],
            unique: true,
            select: false,
        },
    },
    {
        timestamps: true,
    }
);

// Automatically remove blacklist records after three days.
tokenBlacklistSchema.index(
    { createdAt: 1 },
    { expireAfterSeconds: 60 * 60 * 24 * 3 }
);

const TokenBlacklist = mongoose.model(
    "TokenBlacklist",
    tokenBlacklistSchema
);

module.exports = TokenBlacklist;
