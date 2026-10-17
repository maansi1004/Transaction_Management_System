
const express = require("express");
const cookieParser = require("cookie-parser");

// Import routes
const authRouter = require("./routes/auth.routes");
const accountRouter = require("./routes/account.routes");
const transactionRouter = require("./routes/transaction.routes");

const app = express();

// Global middleware
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

// Health-check endpoint
app.get("/health", (req, res) => {
    res.status(200).json({
        status: "success",
        message: "Backend Ledger API is running",
    });
});

// Register routes
app.use("/api/auth", authRouter);
app.use("/api/accounts", accountRouter);
app.use("/api/transactions", transactionRouter);

// Handle unknown routes
app.use((req, res) => {
    res.status(404).json({
        message: "Route not found",
    });
});

// Central error handler
app.use((err, req, res, next) => {
    console.error(err);

    if (res.headersSent) {
        return next(err);
    }

    const statusCode = err.statusCode || 500;

    res.status(statusCode).json({
        message:
            statusCode >= 500
                ? "Internal server error"
                : err.message,
    });
});

module.exports = app;
