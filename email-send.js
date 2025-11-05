/**
 * SAPHAH Central Email Service
 * Unified version — supports:
 *  1️⃣ Funnel emails (header + body + footer)
 *  2️⃣ Daily summary emails
 *  3️⃣ Logging and Firestore sequence management
 */

import { format } from "date-fns";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// -------------------------------------------------------------
// Helpers for __dirname in ES modules
// -------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------------------------------------------------------------
// Current UTC time
// -------------------------------------------------------------
const now = new Date();
const formattedNow = format(now, "yyyy-MM-dd HH:mm:ss") + " UTC";
console.log(`Current UTC time: ${formattedNow}`);

// -------------------------------------------------------------
// Firebase initialization
// -------------------------------------------------------------
if (process.env.EMAILFIREBASEADMIN) {
  const serviceAccount = JSON.parse(process.env.EMAILFIREBASEADMIN);
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

// -------------------------------------------------------------
// Gmail OAuth2 transporter
// -------------------------------------------------------------
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    type: "OAuth2",
    user: process.env.GMAIL_USER,
    clientId: process.env.GMAIL_CLIENT_ID,
    clientSecret: process.env.GMAIL_CLIENT_SECRET,
    refreshToken: process.env.GMAIL_REFRESH_TOKEN,
  },
});

// -------------------------------------------------------------
// File utilities
// -------------------------------------------------------------
const readFile = (file) =>
  fs.existsSync(path.join(__dirname, file))
    ? fs.readFileSync(path.join(__dirname, file), "utf-8").trim()
    : "";

const logDir = path.join(__dirname, "LOGS");
const logFile = path.join(logDir, "email_status.log");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

// -------------------------------------------------------------
// Send email function
// -------------------------------------------------------------
async function sendEmail({ to, subject, text }) {
  try {
    const info = await transporter.sendMail({
      from: `SAPHAH Central <${process.env.GMAIL_USER}>`,
      to,
      subject,
      text,
    });
    console.log(`✅ Email sent: ${subject} → ${to}`);
    fs.appendFileSync(
      logFile,
      `${formattedNow} - Email sent to ${to} (${subject})\n`,
      "utf8"
    );
    return info;
  } catch (err) {
    console.error(`❌ Error sending to ${to}: ${err.message}`);
    fs.appendFileSync(
      logFile,
      `${formattedNow} - FAILED to send to ${to}: ${err.message}\n`,
      "utf8"
    );
  }
}

// -------------------------------------------------------------
// Funnel Email Builder (Subject + Header + Body + Footer)
// -------------------------------------------------------------
function buildEmail(funnelFile, name = "Friend") {
  const headerText = readFile("header.txt");
  const footerText = readFile("footer.txt");
  const content = readFile(funnelFile);
  if (!content) throw new Error(`Funnel file not found: ${funnelFile}`);

  const lines = content.split("\n");
  const subjectLine = lines.find((l) => l.startsWith("Subject:"));
  const
