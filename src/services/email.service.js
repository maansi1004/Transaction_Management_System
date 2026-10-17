
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        type: "OAuth2",
        user: process.env.EMAIL_USER,
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        refreshToken: process.env.REFRESH_TOKEN,
    },
});

// Escape user-provided content before inserting it into HTML.
function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (char) => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
        };

        return entities[char];
    });
}

// Convert integer paise into a display-friendly INR amount.
function formatINR(amountMinor) {
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
        throw new Error("Amount must be a non-negative integer in paise");
    }

    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amountMinor / 100);
}

// Send an email. Errors are logged and rethrown so callers can handle them.
async function sendEmail(to, subject, text, html) {
    if (!process.env.EMAIL_USER) {
        throw new Error("EMAIL_USER is not configured");
    }

    try {
        const info = await transporter.sendMail({
            from: `"Backend Ledger" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            text,
            html,
        });

        console.log("Email sent:", info.messageId);

        return info;
    } catch (error) {
        console.error("Error sending email:", error.message);
        throw error;
    }
}

async function sendRegistrationEmail(userEmail, name) {
    const safeName = escapeHtml(name);
    const subject = "Welcome to Backend Ledger!";

    const text =
        `Hello ${name},\n\n` +
        "Thank you for registering at Backend Ledger. " +
        "We're excited to have you on board!\n\n" +
        "Best regards,\nThe Backend Ledger Team";

    const html =
        `<p>Hello ${safeName},</p>` +
        "<p>Thank you for registering at Backend Ledger. " +
        "We're excited to have you on board!</p>" +
        "<p>Best regards,<br>The Backend Ledger Team</p>";

    return sendEmail(userEmail, subject, text, html);
}

// amountMinor must be an integer amount in paise.
async function sendTransactionEmail(
    userEmail,
    name,
    amountMinor,
    toAccount
) {
    const safeName = escapeHtml(name);
    const safeAccount = escapeHtml(toAccount);
    const amount = formatINR(amountMinor);

    const subject = "Transaction Successful!";

    const text =
        `Hello ${name},\n\n` +
        `Your transfer of ${amount} to account ${toAccount} was successful.\n\n` +
        "Best regards,\nThe Backend Ledger Team";

    const html =
        `<p>Hello ${safeName},</p>` +
        `<p>Your transfer of <strong>${amount}</strong> ` +
        `to account ${safeAccount} was successful.</p>` +
        "<p>Best regards,<br>The Backend Ledger Team</p>";

    return sendEmail(userEmail, subject, text, html);
}

// Send only when the transaction service has confirmed failure.
async function sendTransactionFailureEmail(
    userEmail,
    name,
    amountMinor,
    toAccount
) {
    const safeName = escapeHtml(name);
    const safeAccount = escapeHtml(toAccount);
    const amount = formatINR(amountMinor);

    const subject = "Transaction Failed";

    const text =
        `Hello ${name},\n\n` +
        `Your transfer of ${amount} to account ${toAccount} failed. ` +
        "Please review your transaction history or contact support if needed.\n\n" +
        "Best regards,\nThe Backend Ledger Team";

    const html =
        `<p>Hello ${safeName},</p>` +
        `<p>Your transfer of <strong>${amount}</strong> ` +
        `to account ${safeAccount} failed. ` +
        "Please review your transaction history or contact support if needed.</p>" +
        "<p>Best regards,<br>The Backend Ledger Team</p>";

    return sendEmail(userEmail, subject, text, html);
}

// Optional: verify SMTP configuration during application startup.
async function verifyEmailService() {
    return transporter.verify();
}

module.exports = {
    sendRegistrationEmail,
    sendTransactionEmail,
    sendTransactionFailureEmail,
    verifyEmailService,
};
