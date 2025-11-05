// email-send.js
import { format } from 'date-fns';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// -------------------------------------------------------------
// Helpers for __dirname in ES modules
// -------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------------------------------------------------------------
// Current UTC time
// -------------------------------------------------------------
const now = new Date();
const formattedNow = format(now, 'yyyy-MM-dd HH:mm:ss') + ' UTC';
console.log(`Current UTC time: ${formattedNow}`);

// -------------------------------------------------------------
// Gmail OAuth2 transporter
// -------------------------------------------------------------
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    type: 'OAuth2',
    user: process.env.GMAIL_USER,
    clientId: process.env.GMAIL_CLIENT_ID,
    clientSecret: process.env.GMAIL_CLIENT_SECRET,
    refreshToken: process.env.GMAIL_REFRESH_TOKEN,
  },
});

// -------------------------------------------------------------
// Send email function
// -------------------------------------------------------------
async function sendEmail({ to, subject, text }) {
  try {
    const info = await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to,
      subject,
      text,
    });
    console.log(`Email sent: ${info.messageId}`);
    return info;
  } catch (err) {
    console.error('Error sending email:', err);
    throw err;
  }
}

// -------------------------------------------------------------
// Paths
// -------------------------------------------------------------
const logDir = path.join(__dirname, 'LOGS');
const logFile = path.join(logDir, 'email_status.log');

// Ensure log directory exists
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

// -------------------------------------------------------------
// Determine mode: daily summary or normal email
// -------------------------------------------------------------
async function main() {
  if (process.env.SUBJECT && process.env.BODY && process.env.RECIPIENT) {
    // Daily summary mode
    await sendEmail({
      to: process.env.RECIPIENT,
      subject: process.env.SUBJECT,
      text: process.env.BODY,
    });
  } else {
    // Hourly / test email
    const recipient = process.env.GMAIL_USER;
    const subject = `Saphahemailservices Test Email - ${formattedNow}`;
    const body = `Hello,\n\nThis is a test email sent at ${formattedNow}.\n\nRegards,\nSaphahemailservices`;

    await sendEmail({ to: recipient, subject, text: body });

    // Append to log
    const logLine = `${formattedNow} - Email sent to ${recipient}\n`;
    fs.appendFileSync(logFile, logLine, 'utf8');
  }
}

main().catch((err) => {
  console.error('Email service failed:', err);
  process.exit(1);
});
