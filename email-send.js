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
const MJ_API_KEY = process.env.MAILJET_API_KEY;
const MJ_API_SECRET = process.env.MAILJET_API_SECRET_KEY;

if (!OUTLOOK_USER || !OUTLOOK_PASS) {
  console.error("Missing OUTLOOK_USER or OUTLOOK_PASS in environment.");
  process.exit(1);
}
if (!MJ_API_KEY || !MJ_API_SECRET) {
  console.error("Missing MAILJET_API_KEY or MAILJET_API_SECRET_KEY in environment.");
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
// TRANSPORTERS
// ---------------------------
const outlookTransporter = nodemailer.createTransport({
  host: "smtp.office365.com",
  port: 587,
  secure: false,
  auth: { user: OUTLOOK_USER, pass: OUTLOOK_PASS },
  tls: { ciphers: 'SSLv3' }
});

const mailjet = Mailjet.apiConnect(MJ_API_KEY, MJ_API_SECRET);

// ---------------------------
// HELPER FUNCTIONS
// ---------------------------
function isWeekend() {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

function sendOutlookEmail(to, subject, body, callback) {
  const mailOptions = { from: OUTLOOK_USER, to, subject, text: body };
  outlookTransporter.sendMail(mailOptions, (err, info) => {
    if (err) log(`❌ Outlook failed: ${err.message}`);
    else log(`✅ Outlook sent: "${subject}" to ${to}`);
    callback && callback(err, info);
  });
}

function sendMailjetEmail(to, subject, body, callback) {
  mailjet.post("send", { version: 'v3.1' }).request({
    Messages: [{
      From: { Email: "scs6027main@saphahcentral.mailjet.com", Name: "SaphaH Central" },
      To: [{ Email: to }],
      Subject: subject,
      TextPart: body
    }]
  })
  .then(result => { log(`✅ Mailjet sent: "${subject}" to ${to}`); callback && callback(null, result); })
  .catch(err => { log(`❌ Mailjet failed: ${err.message}`); callback && callback(err); });
}

// ---------------------------
// HANDLE MANUAL SUMMARY MODE
// ---------------------------
if (process.env.SUBJECT && process.env.BODY && process.env.RECIPIENT) {
  // Decide transport based on recipient (example: any Mailjet internal)
  if (process.env.RECIPIENT.endsWith("@saphahcentral.mailjet.com")) {
    sendMailjetEmail(process.env.RECIPIENT, process.env.SUBJECT, process.env.BODY, () => process.exit(0));
  } else {
    sendOutlookEmail(process.env.RECIPIENT, process.env.SUBJECT, process.env.BODY, () => process.exit(0));
  }
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
  if (err) { log(`Error reading funnel folder: ${err.message}`); process.exit(0); }

  files = files.filter(f => f.endsWith('.txt') && !['header.txt','footer.txt'].includes(f));
  if (!files.length) { log("No emails found."); process.exit(0); }

  const day = new Date().getDay();

  files.forEach(file => {
    const draftPath = path.join(funnelDir, file);
    const content = fs.readFileSync(draftPath, 'utf-8');
    const [firstLine, ...rest] = content.split('\n');
    const subject = firstLine.replace(/^Subject:\s*/i, '').trim() || "No Subject";
    let body = `${header}\n\n${rest.join('\n').trim()}\n\n${footer}`;

    if (file.toLowerCase() === 'welcome.txt') {
      let nextEmailNote = '';
      if (day === 5) nextEmailNote = "Your next email will be on Monday.";
      else if (day >= 1 && day <= 4) nextEmailNote = "Your next email will be tomorrow.";
      body += `\n\n${nextEmailNote}`;
    }

    // Decide transport: series_* → Mailjet, others → Outlook
    const transport = file.toLowerCase().startsWith("series_") ? "mailjet" : "outlook";
    const toEmail = transport === "mailjet" ? OUTLOOK_USER.replace("@", `+${file.replace(".txt","")}@`) : OUTLOOK_USER;

    if (transport === "mailjet") {
      sendMailjetEmail(toEmail, subject, body, (err) => {
        if (!err) fs.renameSync(draftPath, path.join(sentDir, file));
      });
    } else {
      sendOutlookEmail(toEmail, subject, body, (err) => {
        if (!err) fs.renameSync(draftPath, path.join(sentDir, file));
      });
    }
  });
});
