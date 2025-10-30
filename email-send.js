// email-send.js
// Hybrid email sender: Mailjet (funnel/) + Outlook (emails/)
// Requires env: OUTLOOK_USER, OUTLOOK_PASS, MAILJET_API_KEY, MAILJET_SECRET_KEY

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const nodeMailjet = require('node-mailjet');

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
const baseDir   = __dirname;         // repo root
const funnelDir = path.join(baseDir, 'funnel');
const emailsDir = path.join(baseDir, 'emails');
const sentDir   = path.join(baseDir, 'sent');
const logsDir   = path.join(baseDir, 'logs');

[funnelDir, emailsDir, sentDir, logsDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const logFile = path.join(logsDir, `email-log-${new Date().toISOString().slice(0,10)}.txt`);
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(logFile, line);
  console.log(line.trim());
}

// ---------------------------
// CREATE TRANSPORTERS / CLIENTS
// ---------------------------
const outlookTransporter = nodemailer.createTransport({
  host: "smtp.office365.com",
  port: 587,
  secure: false, // STARTTLS
  auth: { user: OUTLOOK_USER, pass: OUTLOOK_PASS },
  tls: { ciphers: 'SSLv3' }
});

// Correct node-mailjet usage: call .connect(apiKey, apiSecret) (returns client)
const mailjetClient = nodeMailjet.connect(MAILJET_API_KEY, MAILJET_SECRET_KEY);

// ---------------------------
// HELPERS
// ---------------------------
function isWeekend() {
  const day = new Date().getDay(); // 0=Sunday, 6=Saturday
  return day === 0 || day === 6;
}

function extractRecipientFromBody(body) {
  // Accept formats like:
  // {{RecipientEmail:someone@example.com}}
  // {{ RecipientEmail : someone@example.com }}
  const rx = /{{\s*RecipientEmail\s*:\s*([^}\s]+)\s*}}/i;
  const m = body.match(rx);
  if (m && m[1]) return m[1].trim();
  return null;
}

function sendOutlookEmail(to, subject, body) {
  return new Promise((resolve, reject) => {
    const mailOptions = {
      from: OUTLOOK_USER,
      to,
      subject,
      text: body
    };
    outlookTransporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        log(`❌ Outlook failed to "${to}" subject="${subject}" — ${err.message}`);
        return reject(err);
      }
      log(`✅ Outlook sent to ${to} — "${subject}"`);
      resolve(info);
    });
  });
}

function sendMailjetEmail(to, subject, body) {
  return mailjetClient
    .post("send", { version: 'v3.1' })
    .request({
      Messages: [{
        From: { Email: "scs6027main@saphahcentral.mailjet.com", Name: "Saphah Central" },
        To: [{ Email: to }],
        Subject: subject,
        TextPart: body
      }]
    })
    .then(result => {
      log(`✅ Mailjet sent to ${to} — "${subject}" (ID: ${result.body && result.body.MessageUUID ? result.body.MessageUUID : 'n/a'})`);
      return result;
    })
    .catch(err => {
      const message = err && err.message ? err.message : JSON.stringify(err);
      log(`❌ Mailjet failed to "${to}" subject="${subject}" — ${message}`);
      throw err;
    });
}

// ---------------------------
// Manual summary mode (single send)
if (process.env.SUBJECT && process.env.BODY && process.env.RECIPIENT) {
  (async () => {
    const recipient = process.env.RECIPIENT;
    const subject = process.env.SUBJECT;
    const body = process.env.BODY;
    try {
      if (recipient && recipient.endsWith('@saphahcentral.mailjet.com')) {
        await sendMailjetEmail(recipient, subject, body);
      } else {
        await sendOutlookEmail(recipient, subject, body);
      }
      process.exit(0);
    } catch (e) {
      // Already logged
      process.exit(0); // keep action non-failing (controlled)
    }
  })();
  return;
}

// ---------------------------
// PROCESS A SINGLE FOLDER (returns array of promises)
function processFolder(folderPath, useMailjet) {
  let files = [];
  try {
    files = fs.readdirSync(folderPath).filter(f => f.endsWith('.txt'));
  } catch (e) {
    log(`Error reading folder ${folderPath}: ${e.message}`);
    return [];
  }
  if (!files.length) {
    log(`No emails found in ${folderPath}.`);
    return [];
  }

  const day = new Date().getDay();
  const sendPromises = [];

  files.forEach(file => {
    // Weekend rule: funnel (Mailjet) skips except welcome.txt
    if (useMailjet && (day === 0 || day === 6) && file.toLowerCase() !== 'welcome.txt') {
      log(`Skipping "${file}" on weekend.`);
      return;
    }

    const filePath = path.join(folderPath, file);
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (e) {
      log(`Failed to read "${filePath}": ${e.message}`);
      return;
    }

    // Subject line is first line starting with "Subject:"
    const lines = content.split(/\r?\n/);
    let subject = "No Subject";
    if (lines.length) {
      const firstLine = lines[0];
      if (/^Subject:/i.test(firstLine)) {
        subject = firstLine.replace(/^Subject:\s*/i, '').trim();
        // body is rest of lines
        lines.shift();
      }
    }
    let body = lines.join('\n').trim();

    // Try to extract explicit recipient from body placeholder
    const explicitRecipient = extractRecipientFromBody(body);
    const recipient = explicitRecipient || OUTLOOK_USER; // fallback to OUTLOOK_USER

    if (useMailjet) {
      // send via Mailjet
      const p = sendMailjetEmail(recipient, subject, body)
        .then(res => {
          // move file to sent
          try { fs.renameSync(filePath, path.join(sentDir, file)); } catch(e){ log(`Move-to-sent failed for ${file}: ${e.message}`); }
          return res;
        })
        .catch(err => {
          // keep file in place for retry
          return null;
        });
      sendPromises.push(p);
    } else {
      // send via Outlook
      const p = sendOutlookEmail(recipient, subject, body)
        .then(res => {
          try { fs.renameSync(filePath, path.join(sentDir, file)); } catch(e){ log(`Move-to-sent failed for ${file}: ${e.message}`); }
          return res;
        })
        .catch(err => {
          return null;
        });
      sendPromises.push(p);
    }
  });

  return sendPromises;
}

// ---------------------------
// RUN PROCESS (funnel -> mailjet, emails -> outlook)
(async () => {
  try {
    log("Starting email run...");

    const mailjetPromises = processFolder(funnelDir, true);
    const outlookPromises = processFolder(emailsDir, false);

    // Wait for all to finish (if none, resolves immediately)
    await Promise.all([...mailjetPromises, ...outlookPromises]);

    log("Email run finished.");
    process.exit(0);
  } catch (err) {
    log(`Unexpected error: ${err && err.message ? err.message : String(err)}`);
    process.exit(0);
  }
})();
