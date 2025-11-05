// email-send.js — SAPHAH Funnel Email Automation
// -------------------------------------------------------------
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { format } from 'date-fns';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';

// -------------------------------------------------------------
// Helpers
// -------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const now = new Date();
const formattedNow = format(now, 'yyyy-MM-dd HH:mm:ss') + ' UTC';

// -------------------------------------------------------------
// Firebase initialization (service account from secret)
// -------------------------------------------------------------
const serviceAccount = JSON.parse(process.env.EMAILFIREBASEADMIN);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// -------------------------------------------------------------
// Gmail OAuth2 transporter
// -------------------------------------------------------------
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    type: 'OAuth2',
    user: process.env.GMAIL_USER,
    clientId: process.env.GMAIL_CLIENT_ID,
    clientSecret: process.env.GMAIL_CLIENT_SECRET,
    refreshToken: process.env.GMAIL_REFRESH_TOKEN,
  },
});

// -------------------------------------------------------------
// Utility: Parse funnel email file
// -------------------------------------------------------------
function parseEmailFile(filepath) {
  const content = fs.readFileSync(filepath, 'utf8');
  const parts = content.split(/---HEADER---|---BODY---|---FOOTER---/g).map(p => p.trim());
  const subject = parts[0].replace(/^Subject:\s*/i, '').trim();
  const header = parts[1] || '';
  const body = parts[2] || '';
  const footer = parts[3] || '';
  return { subject, header, body, footer };
}

// -------------------------------------------------------------
// Utility: Personalize message with name/date
// -------------------------------------------------------------
function personalize(template, subscriber) {
  return template
    .replace(/\${name}/g, subscriber.name || 'Friend')
    .replace(/\${date}/g, formattedNow);
}

// -------------------------------------------------------------
// Send a single email
// -------------------------------------------------------------
async function sendEmail(subscriber, emailData) {
  const { subject, header, body, footer } = emailData;

  const text = [
    personalize(header, subscriber),
    '',
    personalize(body, subscriber),
    '',
    personalize(footer, subscriber),
  ].join('\n');

  try {
    const info = await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: subscriber.email,
      subject: personalize(subject, subscriber),
      text,
    });

    console.log(`✅ Sent to ${subscriber.email} — ${info.messageId}`);
    return true;
  } catch (err) {
    console.error(`❌ Error sending to ${subscriber.email}:`, err);
    return false;
  }
}

// -------------------------------------------------------------
// Load all funnel emails
// -------------------------------------------------------------
function loadFunnelEmails() {
  const emailDir = path.join(__dirname, 'emails');
  const files = fs.readdirSync(emailDir).filter(f => f.endsWith('.txt'));
  return files.sort().map(f => parseEmailFile(path.join(emailDir, f)));
}

// -------------------------------------------------------------
// Main: process subscribers
// -------------------------------------------------------------
async function main() {
  console.log(`\n🚀 SAPHAH Funnel Sender started at ${formattedNow}\n`);
  const funnel = loadFunnelEmails();

  const snapshot = await db
    .collection('subscribers')
    .where('confirmed', '==', true)
    .where('unsubscribed', '==', false)
    .get();

  const logDir = path.join(__dirname, 'LOGS');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, 'email_status.log');

  for (const doc of snapshot.docs) {
    const sub = doc.data();
    const id = doc.id;

    // Determine which email to send next
    const index = sub.sequence_index || 0;
    if (index >= funnel.length) {
      console.log(`ℹ️ ${sub.email} has completed the funnel.`);
      continue;
    }

    // Check next_send_date
    const nextSend = sub.next_send_date ? sub.next_send_date.toDate() : null;
    if (nextSend && nextSend > now) {
      console.log(`⏭️ Skipping ${sub.email} — next send at ${nextSend}`);
      continue;
    }

    const emailData = funnel[index];
    const sent = await sendEmail(sub, emailData);

    if (sent) {
      const nextDate = new Date(now);
      nextDate.setDate(nextDate.getDate() + 1);

      await db.collection('subscribers').doc(id).update({
        sequence_index: index + 1,
        welcome_sent: true,
        next_send_date: nextDate,
      });

      const logLine = `${formattedNow} — Sent ${emailData.subject} to ${sub.email}\n`;
      fs.appendFileSync(logFile, logLine, 'utf8');
    }
  }

  console.log('\n✅ All eligible subscribers processed.\n');
}

main().catch((err) => {
  console.error('Email service failed:', err);
  process.exit(1);
});
