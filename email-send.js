// email-send.js — SAPHAH Funnel + DOM6027 + AD HOC SCHEDULE emails
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
// Gmail transporter utility
// -------------------------------------------------------------
function createTransporter(shortSender) {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: `bessingerbackup2024+${shortSender}@gmail.com`,
      clientId: process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
    },
  });
}

// -------------------------------------------------------------
// Parse email template (from EMAILS/ or FUNNEL/)
// -------------------------------------------------------------
function parseEmailTemplate(templateName) {
  // Try EMAILS/ first, then FUNNEL/
  const searchPaths = [
    path.join(__dirname, 'EMAILS', templateName),
    path.join(__dirname, 'FUNNEL', templateName),
  ];

  let templatePath = searchPaths.find(p => fs.existsSync(p));
  if (!templatePath) {
    console.warn(`⚠️ Template not found: ${templateName}`);
    return { subject: 'No Subject', header: '', body: '', footer: '' };
  }

  const content = fs.readFileSync(templatePath, 'utf8');
  const parts = content.split(/---HEADER---|---BODY---|---FOOTER---/g).map(p => p.trim());
  return {
    subject: parts[0] || 'No Subject',
    header: parts[1] || '',
    body: parts[2] || '',
    footer: parts[3] || '',
  };
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
const SENT_DIR = path.join(__dirname, 'SENT');
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
// Process Funnel emails (from Firestore subscribers)
// -------------------------------------------------------------
async function processFunnelSubscribers() {
  const funnelDir = path.join(__dirname, 'FUNNEL');
  if (!fs.existsSync(funnelDir)) {
    console.warn('⚠️ No FUNNEL directory found. Skipping funnel emails.');
    return;
  }

  const snapshot = await db
    .collection('subscribers')
    .where('confirmed', '==', true)
    .where('unsubscribed', '==', false)
    .get();

  if (snapshot.empty) {
    console.log('ℹ️ No active subscribers found.');
    return;
  }

  const templateFiles = fs.readdirSync(funnelDir).filter(f => f.endsWith('.txt'));
  if (templateFiles.length === 0) {
    console.log('ℹ️ No funnel templates found.');
    return;
  }

  for (const doc of snapshot.docs) {
    const sub = doc.data();
    const id = doc.id;
    const sequenceIndex = sub.sequence_index || 0;

    if (sequenceIndex >= templateFiles.length) continue;
    const emailData = parseEmailTemplate(templateFiles[sequenceIndex]);

    const sent = await sendEmailTo(sub, emailData, createTransporter('scs6027email'));

    if (sent) {
      const nextDate = new Date(now);
      nextDate.setDate(nextDate.getDate() + 1);

      await db.collection('subscribers').doc(id).update({
        sequence_index: sequenceIndex + 1,
        next_send_date: nextDate,
      });
    }
  }
}

// -------------------------------------------------------------
// Process DOM6027 notifications (from SCHEDULE folder)
// -------------------------------------------------------------
async function processDOM6027Notifications() {
  const scheduleDir = path.join(__dirname, 'SCHEDULE');
  if (!fs.existsSync(scheduleDir)) {
    console.warn('⚠️ No SCHEDULE directory found. Skipping DOM6027 notifications.');
    return;
  }

  const files = fs.readdirSync(scheduleDir)
    .filter(f => /^DOM6027-.*\.txt$/i.test(f));

  for (const file of files) {
    const filePath = path.join(scheduleDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    if (!lines[0]) continue; // Skip blank placeholders

    const [source, receiver, shortSender] = lines[0].split('|').map(s => s.trim());
    if (!source || !receiver || !shortSender) {
      console.warn(`Skipping invalid SCHEDULE file: ${file}`);
      continue;
    }

    const templateData = parseEmailTemplate(source);
    const subscriber = { email: receiver, name: 'Friend' };
    const transporter = createTransporter(shortSender);

    const sent = await sendEmailTo(subscriber, templateData, transporter);

    if (sent) {
      const sentPath = path.join(__dirname, 'SENT', file);
      fs.renameSync(filePath, sentPath);
      console.log(`📦 Moved sent file to SENT: ${file}`);
    }
  }
}

// -------------------------------------------------------------
// Main execution
// -------------------------------------------------------------
async function main() {
  console.log(`\n🚀 SAPHAH Email Service started at ${formattedNow}\n`);

  await processFunnelSubscribers();
  await processDOM6027Notifications();

  console.log('\n✅ All emails processed.\n');
}

main().catch(err => {
  console.error('Email service failed:', err);
  process.exit(1);
});
