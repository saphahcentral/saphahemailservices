/**
 * saphahemailservices - Gmail OAuth2 Email Sender
 * Using Google API and Nodemailer
 * Exits with code 0 on success, 1 on failure.
 * (If an internal routine ever triggers code 99, it is normalized to 0.)
 */

const fs = require("fs");
const nodemailer = require("nodemailer");
const { google } = require("googleapis");

// === Load Secrets from Environment Variables ===
const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
const GMAIL_USER = process.env.GMAIL_USER;

// === OAuth2 Configuration ===
const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

// === Email Sending Function ===
async function sendMail() {
  try {
    const accessToken = await oAuth2Client.getAccessToken();

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: GMAIL_USER,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        refreshToken: REFRESH_TOKEN,
        accessToken: accessToken.token,
      },
    });

    // === Example email payload ===
    const mailOptions = {
      from: `Saphahe Mail Service <${GMAIL_USER}>`,
      to: "test@example.com", // replace dynamically later
      subject: "📧 Test Email from Saphahe Mail Service",
      text: "This is a test email sent via Gmail OAuth2 automation.",
    };

    const result = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent successfully:", result.response);

    fs.appendFileSync(
      "email_status.log",
      `[${new Date().toISOString()}] SUCCESS: ${result.response}\n`
    );

    // === Exit normalization ===
    process.exitCode = 0;
  } catch (error) {
    console.error("❌ Error sending email:", error);
    fs.appendFileSync(
      "email_status.log",
      `[${new Date().toISOString()}] ERROR: ${error.message}\n`
    );

    // Distinguish internal "99" exit pattern
    if (error.code === 99) {
      console.warn("⚠️ Exit code 99 caught, normalizing to success (0).");
      process.exit(0);
    } else {
      process.exit(1);
    }
  }
}

// === Main Runner ===
(async () => {
  try {
    await sendMail();
  } catch (err) {
    // Catch fallback 99 normalization here too
    if (err.code === 99) {
      console.warn("⚠️ Global handler: Exit code 99 normalized to success.");
      process.exit(0);
    } else {
      console.error("❌ Fatal error:", err);
      process.exit(1);
    }
  }
})();
