// email-send.js
// Core email sending logic for internal services

const nodemailer = require("nodemailer");

async function sendEmail(to, subject, text) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER, // from GitHub Secrets
      pass: process.env.GMAIL_PASS  // from GitHub Secrets
    }
  });

  const mailOptions = {
    from: `"Saphah Central Services" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent:", info.messageId);
  } catch (err) {
    console.error("❌ Failed to send email:", err);
    process.exit(1);
  }
}

// If run directly, send a test email
if (require.main === module) {
  sendEmail(
    "test@example.com",              // change to your test recipient
    "Test Email from SCS",
    "This is a test email sent via GitHub Actions + Nodemailer."
  );
}

module.exports = sendEmail;
