// email-send.js
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

// ---------------------------
// ENVIRONMENT VARIABLES
// ---------------------------
const OUTLOOK_USER = process.env.OUTLOOK_USER;
const OUTLOOK_PASS = process.env.OUTLOOK_PASS;

if (!OUTLOOK_USER || !OUTLOOK_PASS) {
  console.error("Missing OUTLOOK_USER or OUTLOOK_PASS in environment.");
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
// CREATE TRANSPORTER (Outlook)
// ---------------------------
const transporter = nodemailer.createTransport({
  host: "smtp.office365.com",
  port: 587,
  secure: false, // STARTTLS
  auth: {
    user: OUTLOOK_USER,
    pass: OUTLOOK_PASS
  },
  tls: {
    ciphers: 'SSLv3'
  }
});

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

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) {
      log(`❌ Failed to send summary: ${err.message}`);
    } else {
      log(`✅ Sent daily summary to ${process.env.RECIPIENT}`);
    }
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

  // Filter for TXT files excluding header/footer
  files = files.filter(f => f.endsWith('.txt') && !['header.txt','footer.txt'].includes(f));

  if (files.length === 0) {
    log("No emails found in funnel/ folder. Nothing sent this run.");
    process.exit(0);
  }

  // Skip sending on weekends except welcome email
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

    // Add next email info if weekday
    if (file.toLowerCase() === 'welcome.txt') {
      let nextEmailNote = '';
      if (day === 5) nextEmailNote = "Your next email will be on Monday.";
      else if (day >= 1 && day <= 4) nextEmailNote = "Your next email will be tomorrow.";
      body += `\n\n${nextEmailNote}`;
    }

    const mailOptions = {
      from: OUTLOOK_USER,
      to: OUTLOOK_USER, // later replace with subscriber list
      subject,
      text: body,
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
