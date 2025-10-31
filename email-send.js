// email-send.js
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');

// ---------------------------
// ENVIRONMENT VARIABLES
// ---------------------------
const GMAIL_USER      = process.env.GMAIL_USER;        // e.g., saphahcentralservices@gmail.com
const CLIENT_ID       = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET   = process.env.GMAIL_CLIENT_SECRET;
const REFRESH_TOKEN   = process.env.GMAIL_REFRESH_TOKEN;

if (!GMAIL_USER || !CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
  console.error("Missing Gmail OAuth2 secrets in environment.");
  process.exit(1);
}

// ---------------------------
// PATHS
// ---------------------------
const baseDir      = __dirname;
const funnelDir    = path.join(baseDir, 'funnel');
const emailsDir    = path.join(baseDir, 'emails');
const scheduledDir = path.join(baseDir, 'scheduled');
const sentDir      = path.join(baseDir, 'sent');
const logsDir      = path.join(baseDir, 'logs');

[funnelDir, emailsDir, scheduledDir, sentDir, logsDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const logFile = path.join(logsDir, `email-log-${new Date().toISOString().slice(0,10)}.txt`);
function log(msg) {
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
  console.log(msg);
}

// ---------------------------
// CREATE GMAIL TRANSPORTER (OAuth2)
// ---------------------------
const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

async function createTransporter() {
  const accessToken = await oAuth2Client.getAccessToken();
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: GMAIL_USER,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      refreshToken: REFRESH_TOKEN,
      accessToken: accessToken.token,
    },
  });
}

// ---------------------------
// HELPER: Check if today is weekend
// ---------------------------
function isWeekend() {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

// ---------------------------
// PROCESS EMAIL FUNCTION
// ---------------------------
async function sendEmail(to, subject, body) {
  const transporter = await createTransporter();
  const mailOptions = {
    from: GMAIL_USER,
    to,
    subject,
    text: body,
  };
  return transporter.sendMail(mailOptions);
}

// ---------------------------
// PROCESS SCHEDULED EMAILS
// ---------------------------
async function processScheduled() {
  const scheduleFiles = fs.readdirSync(scheduledDir).filter(f => f.endsWith('.txt'));
  if (scheduleFiles.length === 0) {
    log("No scheduled emails found. Exiting with code 99.");
    process.exit(99);
  }

  for (const file of scheduleFiles) {
    const filePath = path.join(scheduledDir, file);
    const content = fs.readFileSync(filePath, 'utf-8').trim();
    if (!content || content === '|') continue; // nothing to send

    const [sendTo, templateName] = content.split('|').map(s => s.trim());
    if (!sendTo || !templateName) continue;

    const templatePath = path.join(emailsDir, templateName);
    if (!fs.existsSync(templatePath)) {
      log(`Template ${templateName} not found. Skipping.`);
      continue;
    }

    let body = fs.readFileSync(templatePath, 'utf-8');
    let subject = body.split('\n')[0].replace(/^Subject:\s*/i, '') || "No Subject";

    try {
      await sendEmail(sendTo, subject, body);
      log(`✅ Sent "${templateName}" to ${sendTo}`);
      // move template copy to SENT with details
      const sentCopy = path.join(sentDir, `${Date.now()}_${templateName}`);
      fs.writeFileSync(sentCopy, `To: ${sendTo}\nSubject: ${subject}\n\n${body}`);
      // delete schedule file
      fs.unlinkSync(filePath);
    } catch (err) {
      log(`❌ Failed to send "${templateName}" to ${sendTo}: ${err.message}`);
    }
  }
}

// ---------------------------
// RUN
// ---------------------------
(async () => {
  log("Starting email-send.js run...");
  await processScheduled();
  log("Email run finished.");
})();
