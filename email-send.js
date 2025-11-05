// email-send.js
import * as dateFnsTz from 'date-fns-tz';
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
// Timezone functions
// -------------------------------------------------------------
const { utcToZonedTime, zonedTimeToUtc } = dateFnsTz;

// Example: convert current UTC time to Africa/Johannesburg
const timeZone = 'Africa/Johannesburg';
const now = new Date();
const zonedNow = utcToZonedTime(now, timeZone);
const formattedNow = format(zonedNow, 'yyyy-MM-dd HH:mm:ss');
console.log(`Current time in ${timeZone}: ${formattedNow}`);

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
// Determine if running daily summary or single email
// -------------------------------------------------------------
const summaryLogPath = path.join(__dirname, 'LOGS', 'email_status.log');

if (process.env.SUBJECT && process.env.BODY && process.env.RECIPIENT) {
  // Daily summary mode
  sendEmail({
    to: process.env.RECIPIENT,
    subject: process.env.SUBJECT,
    text: process.env.BODY,
  });
} else {
  // Example: single test email
  const recipient = process.env.GMAIL_USER;
  const subject = `Test email from Saphahemailservices ${formattedNow}`;
  const body = `Hello,\n\nThis is a test email sent at ${formattedNow}.\n\nRegards,\nSaphahemailservices`;

  sendEmail({
    to: recipient,
    subject,
    text: body,
  }).then(() => {
    // Append to log
    const logLine = `${formattedNow} - Email sent to ${recipient}\n`;
    fs.appendFileSync(summaryLogPath, logLine, 'utf8');
  });
}
