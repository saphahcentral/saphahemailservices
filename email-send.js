// send-email.js
// Saphahemailservices: send email and save copy to sent/

const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

(async function main() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to = process.env.RECIPIENT || user;
  const subject = process.env.SUBJECT || "Saphahemailservices: Automated message";
  const text = process.env.BODY || "This is an automated message from saphahemailservices.";

  if (!user || !pass) {
    console.error("Missing credentials: SMTP_USER and SMTP_PASS must be set as GitHub Secrets.");
    process.exit(2);
  }

  if (!to) {
    console.error("No recipient available. Set RECIPIENT or ensure SMTP_USER is set.");
    process.exit(3);
  }

  // Ensure sent folder exists
  const sentDir = path.join(__dirname, "sent");
  if (!fs.existsSync(sentDir)) fs.mkdirSync(sentDir);

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });

  try {
    console.log("Verifying transporter...");
    await transporter.verify();
    console.log("Transporter verified. Sending email to:", to);

    const info = await transporter.sendMail({
      from: `"Saphah Central Services" <${user}>`,
      to,
      subject,
      text,
    });

    console.log("✅ Email sent. MessageId:", info.messageId);

    // Save copy to sent folder
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = path.join(sentDir, `email-${timestamp}.txt`);
    const content = `To: ${to}\nFrom: ${user}\nSubject: ${subject}\n\n${text}`;
    fs.writeFileSync(filename, content, "utf-8");

    console.log("Saved sent email copy to:", filename);
    process.exit(0);
  } catch (err) {
    console.error("❌ Email sending failed:");
    console.error(err.stack || err);
    if (err.code) console.error("Error code:", err.code);
    if (err.response) console.error("SMTP response:", err.response);
    process.exit(1);
  }
})();
