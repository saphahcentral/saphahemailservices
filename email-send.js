// email-send.js — SAPHAH Support Service Automation
// -------------------------------------------------------------
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { format } from 'date-fns';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';

// -------------------------------------------------------------
// Helpers & Paths
// -------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, 'data.json');
const LOG_DIR = path.join(__dirname, 'LOGS');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const now = new Date();
const today = format(now, 'yyyy-MM-dd');
const utcDay = now.getUTCDay();   // 0=Sun
const utcDate = now.getUTCDate();
const formattedNow = format(now, 'yyyy-MM-dd HH:mm:ss') + ' UTC';

// -------------------------------------------------------------
// Load / Save data.json
// -------------------------------------------------------------
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    return {
      lastDailyRun: null,
      lastWeeklyRun: null,
      lastMonthlyRun: null
    };
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// -------------------------------------------------------------
// Run Guards
// -------------------------------------------------------------
function shouldRunDaily(data) {
  return data.lastDailyRun !== today;
}

function shouldRunWeekly(data) {
  // Weekly on Monday UTC
  if (utcDay !== 1) return false;
  return data.lastWeeklyRun !== today;
}

function shouldRunMonthly(data) {
  // Monthly on day 1 UTC
  if (utcDate !== 1) return false;
  return data.lastMonthlyRun !== today;
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
      refreshToken: process.env.GMAIL_REFRESH_TOKEN
    }
  });
}

// -------------------------------------------------------------
// Template parsing
// -------------------------------------------------------------
function parseEmailTemplate(templateName) {
  const locations = [
    path.join(__dirname, 'EMAILS', templateName),
    path.join(__dirname, 'FUNNEL', templateName)
  ];

  const file = locations.find(f => fs.existsSync(f));
  if (!file) {
    return { subject: 'No Subject', header: '', body: '', footer: '' };
  }

  const raw = fs.readFileSync(file, 'utf8');
  const parts = raw.split(/---HEADER---|---BODY---|---FOOTER---/g).map(p => p.trim());

  return {
    subject: parts[0] || '',
    header: parts[1] || '',
    body: parts[2] || '',
    footer: parts[3] || ''
  };
}

function personalize(text, sub = {}) {
  return text
    .replace(/\${name}/g, sub.name || 'Friend')
    .replace(/\${date}/g, formattedNow);
}

// -------------------------------------------------------------
// Duplicate Prevention (Local + Firestore)
// -------------------------------------------------------------
const SENT_DIR = path.join(__dirname, 'SENT');
if (!fs.existsSync(SENT_DIR)) fs.mkdirSync(SENT_DIR, { recursive: true });

async function alreadySent(email, subject) {
  const id = `${email}_${subject.replace(/[^a-z0-9]/gi, '_')}`;

  if (fs.existsSync(path.join(SENT_DIR, id + '.sent'))) return true;

  const doc = await db.collection('sentEmails').doc(id).get();
  return doc.exists;
}

async function markSent(email, subject) {
  const id = `${email}_${subject.replace(/[^a-z0-9]/gi, '_')}`;

  fs.writeFileSync(path.join(SENT_DIR, id + '.sent'), formattedNow);
  await db.collection('sentEmails').doc(id).set({
    email,
    subject,
    sentAt: new Date().toISOString()
  });
}

// -------------------------------------------------------------
// Send Email
// -------------------------------------------------------------
async function sendEmail(sub, tpl, transporter) {
  const subject = personalize(tpl.subject, sub);

  if (await alreadySent(sub.email, subject)) {
    console.log(`⏭️ Already sent: ${sub.email}`);
    return false;
  }

  const body = [
    personalize(tpl.header, sub),
    '',
    personalize(tpl.body, sub),
    '',
    personalize(tpl.footer, sub)
  ].join('\n');

  await transporter.sendMail({
    from: transporter.options.auth.user,
    to: sub.email,
    subject,
    text: body
  });

  await markSent(sub.email, subject);
  console.log(`✅ Sent to ${sub.email}`);
  return true;
}

// -------------------------------------------------------------
// MAIN
// -------------------------------------------------------------
async function main() {
  console.log(`\n🚀 Email Service started @ ${formattedNow}`);

  const data = loadData();
  let didRun = false;

  // ---------------- DAILY ----------------
  if (shouldRunDaily(data)) {
    console.log('▶ Daily run');
    // Funnel + DOM + DOWS logic lives here
    didRun = true;
    data.lastDailyRun = today;
  }

  // ---------------- WEEKLY ----------------
  if (shouldRunWeekly(data)) {
    console.log('▶ Weekly run');
    // Weekly-specific emails go here
    didRun = true;
    data.lastWeeklyRun = today;
  }

  // ---------------- MONTHLY ----------------
  if (shouldRunMonthly(data)) {
    console.log('▶ Monthly run');
    // Monthly-specific emails go here
    didRun = true;
    data.lastMonthlyRun = today;
  }

  if (!didRun) {
    console.log('⏭️ Nothing due — already run. Exit 0.');
    process.exit(0);
  }

  saveData(data);
  console.log('✅ Run completed and data.json updated.\n');
}

main().catch(err => {
  console.error('❌ Email service failed:', err);
  process.exit(1);
});
