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
const MAILJET_APIKEY = process.env.MAILJET_APIKEY;
const MAILJET_SECRET = process.env.MAILJET_SECRET;

if (!OUTLOOK_USER || !OUTLOOK_PASS || !MAILJET_APIKEY || !MAILJET_SECRET) {
  console.error("Missing required environment variables (Outlook or Mailjet).");
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
// CREATE TRANSPORTERS
// ---------------------------

// Outlook transporter
const outlookTransporter = nodemailer.createTransport({
  host: "smtp.office365.com",
  port: 587,
  secure: false, // STARTTLS
  auth: { user: OUTLOOK_USER, pass: OUTLOOK_PASS },
  tls: { ciphers: 'SSLv3' }
});

// Mailjet client
const mailjet = Mailjet.apiConnect(MAILJET_APIKEY, MAILJET_SECRET);

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
// READ HEADER + FOOTER
// ---------------------------
let header = '', footer = '';
try { header = fs.readFileSync(path.join(funnelDir, 'header.txt'), 'utf-8'); } catch(e) {}
try { footer = fs.readFileSync(path.join(funnelDir, 'footer.txt'), 'utf-8'); } catch(e) {}

// ---------------------------
// MAP FILES TO MAILJET LISTS
// ---------------------------
const mailjetMapping = {
  'welcome.txt': 'scs6027email@saphahcentral.mailjet.com',
  'dom6027.txt': 'dom6027@saphahcentral.mailjet.com',
  'dots6027.txt': 'dots6027@saphahcentral.mailjet.com',
  'dows6027.txt': 'dows6027@saphahcentral.mailjet.com',
  'updates.txt': 'updates@saphahcentral.mailjet.com'
};

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

  files.forEach(async (file) => {
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
      body += `\n\n${nextEmailNote}`;
    }

    // ---------------------------
    // DECIDE SERVICE
    // ---------------------------
    const mailjetRecipient = mailjetMapping[file.toLowerCase()];
    if (mailjetRecipient) {
      // ---------------------------
      // SEND VIA MAILJET
      // ---------------------------
      try {
        await mailjet.post("send", {'version': 'v3.1'}).request({
          Messages: [{
            From: { Email: 'scs6027main@saphahcentral.mailjet.com', Name: "SaphaH Central" },
            To: [{ Email: mailjetRecipient }],
            Subject: subject,
            TextPart: body
          }]
        });
        log(`✅ Sent "${file}" via Mailjet to ${mailjetRecipient}`);
        const sentPath = path.join(sentDir, file);
        fs.renameSync(draftPath, sentPath);
      } catch (err) {
        log(`❌ Mailjet failed for "${file}": ${err.message}`);
      }
    } else {
      // ---------------------------
      // SEND VIA OUTLOOK
      // ---------------------------
      outlookTransporter.sendMail({
        from: OUTLOOK_USER,
        to: OUTLOOK_USER,
        subject,
        text: body
      }, (err, info) => {
        if (err) log(`❌ Outlook failed for "${file}": ${err.message}`);
        else {
          log(`✅ Sent "${file}" via Outlook to ${OUTLOOK_USER}`);
          const sentPath = path.join(sentDir, file);
          fs.renameSync(draftPath, sentPath);
        }
      });
    }
  });
});
