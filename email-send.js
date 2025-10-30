// email-send.js
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const Mailjet = require('node-mailjet');

// ---------------------------
// ENVIRONMENT VARIABLES
// ---------------------------
const OUTLOOK_USER = process.env.OUTLOOK_USER;
const OUTLOOK_PASS = process.env.OUTLOOK_PASS;
const MAILJET_API_KEY = process.env.MAILJET_API_KEY;
const MAILJET_API_SECRET = process.env.MAILJET_SECRET_KEY;

if (!OUTLOOK_USER || !OUTLOOK_PASS) {
  console.error("Missing OUTLOOK_USER or OUTLOOK_PASS in environment.");
  process.exit(1);
}

if (!MAILJET_API_KEY || !MAILJET_API_SECRET) {
  console.error("Missing MAILJET_API_KEY or MAILJET_API_SECRET in environment.");
  process.exit(1);
}

// ---------------------------
// PATHS
// ---------------------------
const baseDir   = __dirname;         // saphahemailservices/
const funnelDir = path.join(baseDir, 'funnel');
const emailsDir = path.join(baseDir, 'emails');
const sentDir   = path.join(baseDir, 'sent');
const logsDir   = path.join(baseDir, 'logs');

[funnelDir, emailsDir, sentDir, logsDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const logFile = path.join(logsDir, `email-log-${new Date().toISOString().slice(0,10)}.txt`);
function log(msg) {
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
  console.log(msg);
}

// ---------------------------
// CREATE TRANSPORTERS
// ---------------------------
const outlookTransporter = nodemailer.createTransport({
  host: "smtp.office365.com",
  port: 587,
  secure: false, // STARTTLS
  auth: { user: OUTLOOK_USER, pass: OUTLOOK_PASS },
  tls: { ciphers: 'SSLv3' }
});

const mailjetClient = Mailjet.apiConnect(MAILJET_API_KEY, MAILJET_SECRET_KEY);

// ---------------------------
// HELPER: Check if today is weekend
// ---------------------------
function isWeekend() {
  const day = new Date().getDay(); // 0=Sunday, 6=Saturday
  return day === 0 || day === 6;
}

// ---------------------------
// HANDLE MANUAL SUMMARY MODE
// ---------------------------
if (process.env.SUBJECT && process.env.BODY && process.env.RECIPIENT) {
  const mailOptions = {
    from: OUTLOOK_USER,
    to: process.env.RECIPIENT,
    subject: process.env.SUBJECT,
    text: process.env.BODY,
  };

  outlookTransporter.sendMail(mailOptions, (err, info) => {
    if (err) log(`❌ Failed to send summary: ${err.message}`);
    else log(`✅ Sent daily summary to ${process.env.RECIPIENT}`);
    process.exit(0);
  });
  return;
}

// ---------------------------
// PROCESS EMAILS FUNCTION
// ---------------------------
function processEmails(folder, service) {
  fs.readdir(folder, (err, files) => {
    if (err) {
      log(`Error reading folder ${folder}: ${err.message}`);
      return;
    }

    // Filter for TXT files
    files = files.filter(f => f.endsWith('.txt'));
    if (files.length === 0) {
      log(`No emails found in ${folder}.`);
      return;
    }

    const today = new Date();
    const day = today.getDay(); // 0=Sunday, 6=Saturday

    files.forEach(file => {
      // Skip weekend emails in funnel except welcome
      if (service === 'mailjet' && (day === 0 || day === 6) && file.toLowerCase() !== 'welcome.txt') {
        log(`Skipping "${file}" on weekend.`);
        return;
      }

      const filePath = path.join(folder, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const [firstLine, ...rest] = content.split('\n');
      const subject = firstLine.replace(/^Subject:\s*/i, '').trim() || "No Subject";
      const body = rest.join('\n').trim();

      if (service === 'outlook') {
        const mailOptions = {
          from: OUTLOOK_USER,
          to: OUTLOOK_USER, // replace later with subscriber list or dynamic address
          subject,
          text: body,
        };

        outlookTransporter.sendMail(mailOptions, (err, info) => {
          if (err) log(`❌ Failed to send "${file}" via Outlook: ${err.message}`);
          else {
            log(`✅ Sent "${file}" via Outlook to ${mailOptions.to}`);
            fs.renameSync(filePath, path.join(sentDir, file));
          }
        });

      } else if (service === 'mailjet') {
        // Extract recipient from placeholder if exists
        let recipient = OUTLOOK_USER; // default fallback
        const match = body.match(/{{RecipientEmail}}/i);
        if (match) recipient = match[1];

        mailjetClient.post("send", { version: 'v3.1' }).request({
          Messages: [{
            From: { Email: OUTLOOK_USER, Name: "Saphah Central" },
            To: [{ Email: recipient, Name: "Subscriber" }],
            Subject: subject,
            TextPart: body,
          }]
        }).then(result => {
          log(`✅ Sent "${file}" via MailJet to ${recipient}`);
          fs.renameSync(filePath, path.join(sentDir, file));
        }).catch(err => {
          log(`❌ Failed to send "${file}" via MailJet: ${err.message}`);
        });
      }
    });
  });
}

// ---------------------------
// RUN EMAILS
// ---------------------------
processEmails(funnelDir, 'mailjet');  // email series
processEmails(emailsDir, 'outlook');  // ad-hoc / transactional
