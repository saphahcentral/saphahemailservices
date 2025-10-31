/**
 * Gmail OAuth2 Email Sender — Final Version
 * Now with no-duplicate-send safeguard + full SENT logging
 */

const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const { google } = require("googleapis");

// === OAuth2 setup ===
const {
  GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET,
  GMAIL_REFRESH_TOKEN,
  GMAIL_USER,
} = process.env;

const oAuth2Client = new google.auth.OAuth2(
  GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);
oAuth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });

// === Directories ===
const baseDir = __dirname;
const scheduleDir = path.join(baseDir, "SCHEDULE");
const emailsDir = path.join(baseDir, "EMAILS");
const sentDir = path.join(baseDir, "SENT");
const logFile = path.join(baseDir, "email_status.log");

// === Helpers ===
function writeLog(message) {
  const entry = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(logFile, entry, "utf8");
  console.log(entry.trim());
}

function safeRead(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8").trim() : "";
}

function recipientAlreadySent(recipient) {
  if (!fs.existsSync(sentDir)) return false;
  const sentFiles = fs.readdirSync(sentDir);
  const sanitized = recipient.replace(/[@.]/g, "_");
  return sentFiles.some((f) => f.includes(sanitized));
}

// === Create SENT dir if missing ===
if (!fs.existsSync(sentDir)) fs.mkdirSync(sentDir);

// === Load static parts ===
const header = safeRead(path.join(emailsDir, "header.txt"));
const footer = safeRead(path.join(emailsDir, "footer.txt"));
const welcome = safeRead(path.join(emailsDir, "welcome.txt"));

// === Read schedule ===
const files = fs.existsSync(scheduleDir)
  ? fs.readdirSync(scheduleDir).filter((f) => f.endsWith(".txt"))
  : [];

if (files.length === 0 || (files.length === 1 && files[0] === "0.txt")) {
  writeLog("No schedule detected. Skipping send.");
  process.exitCode = 0;
  process.exit();
}

// === Begin process ===
(async () => {
  try {
    const accessToken = await oAuth2Client.getAccessToken();

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: GMAIL_USER,
        clientId: GMAIL_CLIENT_ID,
        clientSecret: GMAIL_CLIENT_SECRET,
        refreshToken: GMAIL_REFRESH_TOKEN,
        accessToken: accessToken.token,
      },
    });

    // === Prepare recipient list ===
    const recipients = [];
    for (const file of files) {
      const email = fs.readFileSync(path.join(scheduleDir, file), "utf8").trim();
      if (
        email &&
        email !== "test@example.com" &&
        !recipientAlreadySent(email)
      ) {
        recipients.push(email);
      } else if (recipientAlreadySent(email)) {
        writeLog(`Skipped duplicate: ${email}`);
      }
    }

    if (recipients.length === 0) {
      writeLog("No valid unsent recipients found. Exiting gracefully.");
      process.exitCode = 0;
      process.exit();
    }

    // === Email details ===
    const subject = "Automated Notice from SCS / DOTS Service";
    const htmlBody = `
      ${header}
      ${welcome}
      ${footer}
    `;

    // === Send loop ===
    for (const recipient of recipients) {
      try {
        await transporter.sendMail({
          from: `Saphahemailservices <${GMAIL_USER}>`,
          to: recipient,
          subject,
          html: htmlBody,
        });

        writeLog(`Email sent to ${recipient}`);

        // Write SENT record
        const sentCopy = `
===============================
 SENT EMAIL LOG
===============================
Date: ${new Date().toISOString()}
To: ${recipient}
From: ${GMAIL_USER}
Subject: ${subject}
-------------------------------
[HEADER]
${header}
-------------------------------
[BODY]
${welcome}
-------------------------------
[FOOTER]
${footer}
===============================
`;
        const sentFile = path.join(
          sentDir,
          `${Date.now()}-${recipient.replace(/[@.]/g, "_")}.txt`
        );
        fs.writeFileSync(sentFile, sentCopy.trim(), "utf8");
      } catch (err) {
        writeLog(`Error sending to ${recipient}: ${err.message}`);
      }
    }

    writeLog("Email batch completed successfully.");
    process.exitCode = 0;
  } catch (err) {
    writeLog(`Fatal error: ${err.message}`);
    process.exitCode = 1;
  } finally {
    process.exit();
  }
})();
