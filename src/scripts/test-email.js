
require("dotenv").config();

const {
    sendRegistrationEmail,
    verifyEmailService,
} = require("../services/email.service");

async function testEmail() {
    try {
        console.log("Checking Gmail configuration...");

        // Verify the SMTP connection and authentication.
        await verifyEmailService();
        console.log("Gmail authentication successful!");

        // Send a test email to your configured Gmail address.
        const result = await sendRegistrationEmail(
            process.env.EMAIL_USER,
            "Test User"
        );

        console.log("Test email sent successfully!");
        console.log("Message ID:", result.messageId);
        console.log("Check your inbox and Spam folder.");
    } catch (error) {
        console.error("Test email failed:", error.message);
        process.exitCode = 1;
    }
}

testEmail();
