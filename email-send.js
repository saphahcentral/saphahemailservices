// email-send.js — SAPHAH Email Automation (Resilient Scheduler)
// -------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { format } from 'date-fns';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';

// -------------------------------------------------------------
// Paths & Time
// -------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const now = new Date();
const todayUTC = format(now, 'yyyy-MM-dd');
const dayOfWeek = now.getUTCDay();   // 0 = Sunday
const dayOfMonth = now.getUTCDate();

const formattedNow = format(now, 'yyyy-MM-dd HH:mm:ss') + ' UTC';

// -------------------------------------------------------------
// Load data.json (run-state)
// -------------------------------------------------------------
const DATA_FILE = path.join(__dirname, 'data.json');

function loadRunState() {
  if (!fs.existsSync(DATA_FILE)) {
    return { daily: {}, weekly: {}, monthly: {} };
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveRunState(state) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

// -------------------------------------------------------------
// Run eligibility checks
// -------------------------------------------------------------
function shouldRunDaily(state) {
  return state.daily.lastRun !== todayUTC;
}

function shouldRunWeekly(state) {
  // Weekly = Monday (UTC)
  return dayOfWeek === 1 && state.weekly.lastRun !== todayUTC;
}

function shouldRunMonthly(state) {
  // Monthly = 1st of month (UTC)
  return dayOfMonth === 1 && state.monthly.lastRun !== todayUTC;
}

// -------------------------------------------------------------
// Firebase initialization
// -------------------------------------------------------------
const serviceAccount = JSON.parse(process.env.EMAILFIREBASEADMIN);
serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// -------------------------------------------------------------
// Gmail transporter
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
// Template parsing
// -------------------------------------------------------------
function parseEmailTemplate(templateName) {
  const searchPaths = [
    path.join(__dirname, 'EMAILS', templateName),
    path.join(__dirname, 'FUNNEL', templateName),
  ];

  const templatePath = searchPaths.find(p => fs.existsSync(p));
  if (!templatePath) {
    console.warn(`⚠️ Template not found: ${templateName}`);
    return { subject: 'No Subject', header: '', body: '', footer: '' };
  }

  const content = fs.readFileSync(templatePath, 'utf8');
  const parts = content
    .split(/---HEADER---|---BODY---|---FOOTER---/g)
    .map(p => p.trim());

  return {
    subject: parts[0] || '',
    header: parts[1] || '',
    body: parts[2] || '',
    footer: parts[3] || '',
  };
}

function personalize(text, subscriber = {}) {
  return text
    .replace(/\${name}/g, subscriber.name || 'Friend')
    .replace(/\${date}/g, formattedNow);
}

// -------------------------------------------------------------
// Duplicate prevention (Firestore + local)
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
  const f = path.join(SENT_DIR, `${email}_${subject.replace(/[^a-zA-Z0-9]/g, '_')}.sent`);
  return fs.existsSync(f);
}

function markSentLocal(email, subject) {
  const f = path.join(SENT_DIR, `${email}_${subject.replace(/[^a-zA-Z0-9]/g, '_')}.sent`);
  fs.writeFileSync(f, formattedNow);
}

// -------------------------------------------------------------
// Send single email
// -------------------------------------------------------------
async function sendEmailTo(subscriber, emailData, transporter) {
  const subject = personalize(emailData.subject, subscriber);

  if (
    alreadySentLocal(subscriber.email, subject) ||
    await alreadySentFirestore(subscriber.email, subject)
  ) {
    console.log(`⏭️ Duplicate skipped: ${subscriber.email}`);
    return false;
  }

  const text = [
    personalize(emailData.header, subscriber),
    '',
    personalize(emailData.body, subscriber),
    '',
    personalize(emailData.footer, subscriber),
  ].join('\n');

  const info = await transporter.sendMail({
    from: transporter.options.auth.user,
    to: subscriber.email,
    subject,
    text,
  });

  console.log(`✅ Sent: ${subscriber.email} (${info.messageId})`);
  markSentLocal(subscriber.email, subject);
  await markSentFirestore(subscriber.email, subject);
  return true;
}

// -------------------------------------------------------------
// Existing processors (unchanged logic)
// -------------------------------------------------------------
async function processFunnelSubscribers() { /* unchanged */ }
async function processDOM6027Notifications() { /* unchanged */ }
async function processDOWS6027Triggers() { /* unchanged */ }

// -------------------------------------------------------------
// MAIN
// -------------------------------------------------------------
async function main() {
  console.log(`\n🚀 SAPHAH Email Service @ ${formattedNow}\n`);

  const state = loadRunState();

  const runDaily   = shouldRunDaily(state);
  const runWeekly  = shouldRunWeekly(state);
  const runMonthly = shouldRunMonthly(state);

  if (!runDaily && !runWeekly && !runMonthly) {
    console.log('⏭️ Nothing due — already completed. Exit 0.');
    process.exit(0);
  }

  if (runDaily) {
    console.log('▶ DAILY run');
    await processFunnelSubscribers();
    await processDOM6027Notifications();
    state.daily.lastRun = todayUTC;
  }

  if (runWeekly) {
    console.log('▶ WEEKLY run');
    await processDOWS6027Triggers();
    state.weekly.lastRun = todayUTC;
  }

  if (runMonthly) {
    console.log('▶ MONTHLY run');
    // (reserved for future monthly logic)
    state.monthly.lastRun = todayUTC;
  }

  saveRunState(state);
  console.log('\n✅ Run complete. State updated.\n');
}

main().catch(err => {
  console.error('❌ Email service failed:', err);
  process.exit(1);
});
