// send-email.js
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

if (!SMTP_USER || !SMTP_PASS) {
  console.error("Missing SMTP_USER or SMTP_PASS in environment.");
  process.exit(1);
}

// Create transporter
const transporter = nodemailer.createTransport({
  service: 'gmail', // works with Gmail + app password
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

// Ensure dirs exist
const draftsDir = path.join(__dirname, 'funnel');
const sentDir = path.join(__dirname, 'sent');
const logsDir = path.join(__dirname, 'logs');
[draftsDir, sentDir, logsDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Daily log file
const logFile = path.join(logsDir, `email-log-${new Date().toISOString().slice(0,10)}.txt`);
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(logFile, line);
  console.log(line.trim());
}

// Handle special case: summary mode
if (process.env.SUBJECT && process.env.BODY && process.env.RECIPIENT) {
  const mailOptions = {
    from: SMTP_USER,
    to: process.env.RECIPIENT,
    subject: process.env.SUBJECT,
    text: process.env.BODY,
  };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) {
      log(`❌ Failed to send summary: ${err.message}`);
      process.exit(0); // no failure
    } else {
      log(`✅ Sent daily summary to ${process.env.RECIPIENT}`);
      process.exit(0);
    }
  });
  return;
}

// Process drafts
fs.readdir(draftsDir, (err, files) => {
  if (err) {
    log(`Error reading drafts folder: ${err.message}`);
    process.exit(0);
  }

  if (files.length === 0) {
    log("No drafts found. Nothing to send.");
    process.exit(0);
  }

  files.forEach(file => {
    const draftPath = path.join(draftsDir, file);
    const content = fs.readFileSync(draftPath, 'utf-8');
    const [firstLine, ...rest] = content.split('\n');
    const subject = firstLine.replace(/^Subject:\s*/i, '').trim();
    const body = rest.join('\n').trim();

    const mailOptions = {
      from: SMTP_USER,
      to: SMTP_USER, // or replace with a subscriber list service later
      subject: subject || "No Subject",
      text: body || "(empty message)",
    };

    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        log(`❌ Failed to send "${file}": ${err.message}`);
      } else {
        log(`✅ Sent "${file}" successfully to ${mailOptions.to}`);
        // move file to sent/
        const sentPath = path.join(sentDir, file);
        fs.renameSync(draftPath, sentPath);
      }
    });
  });
});
