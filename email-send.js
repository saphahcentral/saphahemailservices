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
const MAILJET_SECRET_KEY = process.env.MAILJET_SECRET_KEY;

if (!OUTLOOK_USER || !OUTLOOK_PASS) {
  console.error("Missing OUTLOOK_USER or OUTLOOK_PASS in environment.");
  process.exit(1);
}

if (!MAILJET_API_KEY || !MAILJET_SECRET_KEY) {
  console.error("Missing MAILJET_API_KEY or MAILJET_SECRET_KEY in environment.");
  process.exit(1);
}

// ---------------------------
// PATHS
// ---------------------------
const baseDir     = __dirname;
const funnelDir   = path.join(baseDir, 'funnel');
const emailsDir   = path.join(baseDir, 'emails');
const scheduledDir= path.join(baseDir, 'scheduled');
const sentDir     = path.join(baseDir, 'sent');
const logsDir     = path.join(baseDir, 'logs');

[funnelDir, emailsDir, scheduledDir, sentDir, logsDir].forEach(dir => {
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
  secure: false,
  auth: { user: OUTLOOK_USER, pass: OUTLOOK_PASS },
  tls: { ciphers: 'SSLv3' }
});

const mailjetClient = Mailjet.apiConnect(MAILJET_API_KEY, MAILJET_SECRET_KEY);

// ---------------------------
// HELPER FUNCTIONS
// ---------------------------
function isWeekend() {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

function getReplyTo(sendingEmail) {
  let replyTo = 'saphahcentralservices@gmail.com';
  const match = sendingEmail.match(/^([^@]+)@saphahcentral\.mailjet\.com$/i);
  if (match) replyTo = `saphahcentralservices+${match[1]}@gmail.com`;
  return replyTo;
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
// SEND FUNCTIONS
// ---------------------------
function sendOutlook(toEmail, subject, body, replyTo) {
  return new Promise((resolve, reject) => {
    const mailOptions = { from: OUTLOOK_USER, to: toEmail, subject, text: body, replyTo };
    outlookTransporter.sendMail(mailOptions, (err, info) => err ? reject(err) : resolve(info));
  });
}

function sendMailJet(fromEmail, replyTo, toEmail, subject, body) {
  return mailjetClient.post("send", { version: 'v3.1' }).request({
    Messages: [{
      From: { Email: fromEmail, Name: "Saphah Central" },
      To: [{ Email: toEmail, Name: "Subscriber" }],
      Subject: subject,
      TextPart: body,
      ReplyTo: { Email: replyTo }
    }]
  });
}

// ---------------------------
// PROCESS EMAIL FILE
// ---------------------------
function processEmailFile(templatePath, toEmail, sendingEmail, service) {
  const content = fs.readFileSync(templatePath, 'utf-8');
  const [firstLine, ...rest] = content.split('\n');
  const subject = firstLine.replace(/^Subject:\s*/i, '').trim() || "No Subject";
  const body = `${header}\n\n${rest.join('\n').trim()}\n\n${footer}`;
  const replyTo = getReplyTo(sendingEmail);

  // Prepare content for sent copy
  const sentContent = `From: ${sendingEmail}\nTo: ${toEmail}\nSubject: ${subject}\n\n${body}`;

  if (service === 'mailjet') {
    sendMailJet(sendingEmail, replyTo, toEmail, subject, body)
      .then(result => {
        log(`✅ Sent "${path.basename(templatePath)}" via MailJet to ${toEmail}`);
        fs.writeFileSync(path.join(sentDir, path.basename(templatePath)), sentContent);
      })
      .catch(err => log(`❌ Failed "${path.basename(templatePath)}" via MailJet: ${err.message}`));
  } else {
    sendOutlook(toEmail, subject, body, replyTo)
      .then(info => {
        log(`✅ Sent "${path.basename(templatePath)}" via Outlook to ${toEmail}`);
        fs.writeFileSync(path.join(sentDir, path.basename(templatePath)), sentContent);
      })
      .catch(err => log(`❌ Failed "${path.basename(templatePath)}" via Outlook: ${err.message}`));
  }
}

// ---------------------------
// PROCESS FUNNEL EMAILS
// ---------------------------
fs.readdir(funnelDir, (err, files) => {
  if (err) return log(`Error reading funnel folder: ${err.message}`);
  files = files.filter(f => f.endsWith('.txt') && !['header.txt','footer.txt'].includes(f));

  const day = new Date().getDay();
  files.forEach(file => {
    if ((day === 0 || day === 6) && file.toLowerCase() !== 'welcome.txt') {
      log(`Skipping "${file}" on weekend.`);
      return;
    }
    const templatePath = path.join(funnelDir, file);
    processEmailFile(templatePath, OUTLOOK_USER, OUTLOOK_USER, 'mailjet');
  });
});

// ---------------------------
// PROCESS SCHEDULED EMAILS
// ---------------------------
fs.readdir(scheduledDir, (err, files) => {
  if (err) return log(`Error reading scheduled folder: ${err.message}`);
  files = files.filter(f => f.endsWith('.txt'));
  files.forEach(file => {
    const filePath = path.join(scheduledDir, file);
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
    lines.forEach(line => {
      const [toEmail, sendingEmail, templateFile] = line.split('|').map(s => s.trim());
      if (!templateFile) return;
      const templatePath = path.join(emailsDir, templateFile);
      processEmailFile(templatePath, toEmail, sendingEmail, 'outlook');
    });
    fs.unlinkSync(filePath); // delete after processing
  });
});
