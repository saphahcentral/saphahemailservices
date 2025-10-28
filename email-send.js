// email-send.js
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

// ---------------------------
// ENVIRONMENT VARIABLES
// ---------------------------
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

if (!SMTP_USER || !SMTP_PASS) {
  console.error("Missing SMTP_USER or SMTP_PASS in environment.");
  process.exit(1);
}

// ---------------------------
// PATHS
// ---------------------------
const baseDir   = __dirname;           // saphahemailservices/
const funnelDir = path.join(baseDir, 'funnel');
const sentDir   = path.join(baseDir, 'sent');
const logsDir   = path.join(baseDir, 'logs');

[funnelDir, sentDir, logsDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const logFile = path.join(logsDir, `email-log-${new Date().toISOString().slice(0,10)}.txt`);
function log(msg) {
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
  console.log(msg);
}

// ---------------------------
// CREATE TRANSPORTER (OUTLOOK)
// ---------------------------
const transporter = nodemailer.createTransport({
  host: "smtp.office365.com",
  port: 587,
  secure: false, // STARTTLS
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
  tls: { ciphers: 'SSLv3' }
});

// ---------------------------
// HANDLE MANUAL SUMMARY MODE
// ---------------------------
if (process.env.SUBJECT && process.env.BODY && process.env.RECIPIENT) {
  const mailOptions = {
    from: SMTP_USER,
    to: process.env.RECIPIENT,
    subject: process.env.SUBJECT,
    text: process.env.BODY,
  };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) log(`❌ Failed to send summary: ${err.message}`);
    else log(`✅ Sent daily summary to ${process.env.RECIPIENT}`);
    process.exit(0);
  });
  return;
}

// ---------------------------
// READ HEADER + FOOTER
// ---------------------------
let header = '', footer = '';
try { header = fs.readFileSync(path.join(funnelDir, 'header.txt'), 'utf-8'); } catch(e) {}
try { footer = fs.readFileSync(path.join(funnelDir, 'footer.txt'), 'utf-8'); } catch(e) {}

// ---------------------------
// PROCESS EMAIL DRAFTS
// ---------------------------
fs.readdir(funnelDir, (err, files) => {
  if (err) {
    log(`Error reading funnel folder: ${err.message}`);
    process.exit(0);
  }

  files = files.filter(f => f.endsWith('.txt') && !['header.txt','footer.txt'].includes(f));

  if (files.length === 0) {
    log("No emails found in funnel/ folder. Nothing sent this run.");
    process.exit(0);
  }

  const today = new Date();
  const day = today.getDay(); // 0=Sunday, 6=Saturday

  files.forEach(file => {
    if ((day === 0 || day === 6) && file.toLowerCase() !== 'welcome.txt') {
      log(`Skipping "${file}" on weekend.`);
      return;
    }

    const draftPath = path.join(funnelDir, file);
    const content = fs.readFileSync(draftPath, 'utf-8');
    const [firstLine, ...rest] = content.split('\n');
    const subject = firstLine.replace(/^Subject:\s*/i, '').trim() || "No Subject";

    let body = rest.join('\n').trim();
    body = `${header}\n\n${body}\n\n${footer}`;

    if (file.toLowerCase() === 'welcome.txt') {
      let nextEmailNote = '';
      if (day === 5) nextEmailNote = "Your next email will be on Monday.";
      else if (day >= 1 && day <= 4) nextEmailNote = "Your next email will be tomorrow.";
      body += `\n\n${ne
