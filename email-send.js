// send-email.js
// Simple, robust sender for GitHub Actions. Reads credentials from env vars.

const nodemailer = require("nodemailer");

(async function main() {
  // Accept multiple environment variable names (flexible)
  const user = process.env.GMAIL_USER || process.env.SMTP_USER;
  const pass = process.env.GMAIL_PASS || process.env.SMTP_PASS;
  const to = process.env.RECIPIENT || process.env.TEST_RECIPIENT || user;
  const subject = process.env.SUBJECT || "Saphahemailservices: Automated message";
  const text = process.env.BODY || "This is an automated message from saphahemailservices.";

  // Basic validation
  if (!user || !pass) {
    console.error("Missing credentials: set GMAIL_USER and GMAIL_PASS as GitHub Secrets.");
    process.exit(2);
  }
  if (!to) {
    console.error("No recipient available. Set RECIPIENT or TEST_RECIPIENT or ensure GMAIL_USER is set.");
    process.exit(3);
  }

  // Create SMTP transporter (Gmail)
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass }
  });

  try {
    console.log("Verifying transporter (will fail fast if auth/network problem)...");
    await transporter.verify(); // will throw if credentials or network are wrong
    console.log("Transporter verified. Sending email to:", to);

    const info = await transporter.sendMail({
      from: `"Saphah Central Services" <${user}>`,
      to,
      subject,
      text
    });

    console.log("✅ Email sent successfully. messageId:", info.messageId);
    process.exit(0);
  } catch (err) {
    console.error("❌ Email sending failed:");
    // Show full error stack if available
    console.error(err && (err.stack || err));
    // nodemailer specific errors often have code and response
    if (err.code) console.error("Error code:", err.code);
    if (err.response) console.error("SMTP response:", err.response);

    // Exit with non-zero -> workflow step will be marked failed
    process.exit(1);
  }
})();
