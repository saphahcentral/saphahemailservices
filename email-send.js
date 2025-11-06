// email-send.js — SAPHAH Funnel + DOM6027 Notifications
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
serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// -------------------------------------------------------------
// Gmail transporters
// -------------------------------------------------------------
const funnelTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    type: 'OAuth2',
    user: process.env.GMAIL_USER,
    clientId: process.env.GMAIL_CLIENT_ID,
    clientSecret: process.env.GMAIL_CLIENT_SECRET,
    refreshToken: process.env.GMAIL_REFRESH_TOKEN,
  },
});

const dom6027Transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    type: 'OAuth2',
    user: 'bessingerbackup2024+dom6027@gmail.com',
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
function personalize(template, subscriber = {}) {
  return template
    .replace(/\${name}/g, subscriber.name || 'Friend')
    .replace(/\${date}/g, formattedNow);
}

// -------------------------------------------------------------
// Duplicate prevention helpers
// -------------------------------------------------------------
const SENT_DIR = path.resolve('SENT');
if (!fs.existsSync(SENT_DIR)) fs.mkdirSync(SENT_DIR, { recursive: true });

async function alreadySentFirestore(email, subject) {
  const id = `${email}_${subject.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const doc = await db.collection('sentEmails').doc(id).get();
  return doc.exists;
}

async function markSentFirestore(email, subject) {
  const id = `${email}_${subject.replace(/[^a-zA-Z0-9]/g, '_')}`;
  await db.collection('sentEmails').doc(id).set({
    email,
    subject,
    sentAt: new Date().toISOString(),
  });
}

function alreadySentLocal(email, subject) {
  const file = path.join(SENT_DIR, `${email}_${subject.replace(/[^a-zA-Z0-9]/g, '_')}.sent`);
  return fs.existsSync(file);
}

function markSentLocal(email, subject) {
  const file = path.join(SENT_DIR, `${email}_${subject.replace(/[^a-zA-Z0-9]/g, '_')}.sent`);
  fs.writeFileSync(file, formattedNow, 'utf8');
}

// -------------------------------------------------------------
// Send a single email
// -------------------------------------------------------------
async function sendEmailTo(subscriber, emailData, transporter) {
  const { subject, header, body, footer } = emailData;
  const personalizedSubject = personalize(subject, subscriber);

  if (alreadySentLocal(subscriber.email, personalizedSubject) ||
      await alreadySentFirestore(subscriber.email, personalizedSubject)) {
    console.log(`⏭️ Skipping duplicate: ${subscriber.email} — "${personalizedSubject}"`);
    return false;
  }

  const text = [
    personalize(header, subscriber),
    '',
    personalize(body, subscriber),
    '',
    personalize(footer, subscriber),
  ].join('\n');

  try {
    const info = await transporter.sendMail({
      from: transporter.options.auth.user,
      to: subscriber.email,
      subject: personalizedSubject,
      text,
    });

    console.log(`✅ Sent to ${subscriber.email} — ${info.messageId}`);
    markSentLocal(subscriber.email, personalizedSubject);
    await markSentFirestore(subscriber.email, personalizedSubject);
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
// Load DOM6027 SCHEDULE files
// -------------------------------------------------------------
function loadDOM6027Schedule() {
  const scheduleDir = path.join(__dirname, 'SCHEDULE');
  if (!fs.existsSync(scheduleDir)) return [];
  return fs.readdirSync(scheduleDir)
    .filter(f => /^DOM6027-[A-Z]+-\d{8}\.txt$/i.test(f))
    .map(f => path.join(scheduleDir, f));
}

// -------------------------------------------------------------
// Process funnel subscribers
// -------------------------------------------------------------
async function processFunnelSubscribers(funnel) {
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

    const index = sub.sequence_index || 0;
    if (index >= funnel.length) {
      console.log(`ℹ️ ${sub.email} has completed the funnel.`);
      continue;
    }

    const nextSend = sub.next_send_date ? sub.next_send_date.toDate() : null;
    if (nextSend && nextSend > now) {
      console.log(`⏭️ Skipping ${sub.email} — next send at ${nextSend}`);
      continue;
    }

    const emailData = funnel[index];
    const sent = await sendEmailTo(sub, emailData, funnelTransporter);

    if (sent) {
      const nextDate = new Date(now);
      nextDate.setDate(nextDate.getDate() + 1);

      await db.collection('subscribers').doc(id).update({
        sequence_index: index + 1,
        welcome_sent: true,
        next_send_date: nextDate,
      });

      fs.appendFileSync(logFile, `${formattedNow} — Sent ${emailData.subject} to ${sub.email}\n`, 'utf8');
    }
  }
}

// -------------------------------------------------------------
// Process DOM6027 notifications
// -------------------------------------------------------------
async function processDOM6027Notifications() {
  const scheduleFiles = loadDOM6027Schedule();
  if (scheduleFiles.length === 0) return;

  const logDir = path.join(__dirname, 'LOGS');
  const logFile = path.join(logDir, 'email_status.log');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  for (const file of scheduleFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);
    const subject = lines[0] || 'DOM6027 Notification';
    const body = lines.slice(1).join('\n');

    const subscriber = { email: 'LASTWARNERS2024@googlegroups.com', name: 'Friends' };

    const sent = await sendEmailTo(subscriber, { subject, header: '', body, footer: '' }, dom6027Transporter);

    if (sent) {
      fs.appendFileSync(logFile, `${formattedNow} — Sent DOM6027 notification: ${subject}\n`, 'utf8');
      fs.renameSync(file, file + '.sent');
    }
  }
}

// -------------------------------------------------------------
// Main execution
// -------------------------------------------------------------
async function main() {
  console.log(`\n🚀 SAPHAH Email Service started at ${formattedNow}\n`);

  const funnel = loadFunnelEmails();
  await processFunnelSubscribers(funnel);
  await processDOM6027Notifications();

  console.log('\n✅ All emails processed.\n');
}

main().catch(err => {
  console.error('Email service failed:', err);
  process.exit(1);
});
