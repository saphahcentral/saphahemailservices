/**
 * email-send.js
 * Handles subscriber funnel emails only.
 *
 * Logic:
 * - If welcome_sent == false → send welcome email immediately.
 * - If welcome_sent == true and current time >= next_send (08h00 SAST) → send next funnel email.
 * - After each send, update next_send = next weekday 08h00 SAST and sequence_index += 1.
 */

import mysql from 'mysql2/promise';
import nodemailer from 'nodemailer';
import { format, addDays, isSaturday, isSunday } from 'date-fns';
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';

// === DATABASE CONFIG ===
const db = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'yourpassword',
  database: 'saphahemailservice'
});

// === MAIL TRANSPORT CONFIG ===
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'youremail@gmail.com',
    pass: 'your-app-password'
  }
});

// === HELPER FUNCTIONS ===

// Get current time in South Africa
function nowSAST() {
  return utcToZonedTime(new Date(), 'Africa/Johannesburg');
}

// Compute next weekday 08h00 SAST
function nextWeekday08h00() {
  let next = addDays(nowSAST(), 1);
  // Skip weekends
  if (isSaturday(next)) next = addDays(next, 2);
  if (isSunday(next)) next = addDays(next, 1);
  next.setHours(8, 0, 0, 0);
  return zonedTimeToUtc(next, 'Africa/Johannesburg'); // store in UTC in DB
}

// === EMAIL SEQUENCE TEMPLATES ===
const funnelEmails = [
  { id: 1, subject: "Welcome to Our Family!", template: "welcome.html" },
  { id: 2, subject: "Discover More About Us", template: "email2.html" },
  { id: 3, subject: "Our Vision and Mission", template: "email3.html" },
  { id: 4, subject: "Stay Connected", template: "email4.html" }
];

// === MAIN FUNNEL FUNCTION ===
async function processFunnelEmails() {
  console.log(`[${format(nowSAST(), 'yyyy-MM-dd HH:mm')}] Checking subscribers...`);

  const [rows] = await db.execute('SELECT * FROM subscribers');
  for (const user of rows) {
    const { email, name, welcome_sent, next_send, sequence_index } = user;

    // 1️⃣ Welcome email logic
    if (!welcome_sent) {
      console.log(`→ Sending welcome email to ${email}`);
      await sendEmail(email, name, funnelEmails[0]);
      const nextSend = nextWeekday08h00();
      await db.execute(
        'UPDATE subscribers SET welcome_sent = ?, sequence_index = ?, next_send = ? WHERE email = ?',
        [true, 1, nextSend, email]
      );
      continue;
    }

    // 2️⃣ Funnel sequence logic
    if (welcome_sent && next_send && new Date() >= new Date(next_send)) {
      const seq = sequence_index + 1;
      const nextEmail = funnelEmails.find(e => e.id === seq);

      if (!nextEmail) {
        console.log(`✔️ Sequence complete for ${email}.`);
        await db.execute('UPDATE subscribers SET next_send = NULL WHERE email = ?', [email]);
        continue;
      }

      console.log(`→ Sending funnel email #${seq} to ${email}`);
      await sendEmail(email, name, nextEmail);
      const nextSend = nextWeekday08h00();
      await db.execute(
        'UPDATE subscribers SET sequence_index = ?, next_send = ? WHERE email = ?',
        [seq, nextSend, email]
      );
    }
  }

  console.log('✅ Funnel email process complete.');
}

// === EMAIL SENDER ===
async function sendEmail(to, name, emailData) {
  const html = await getTemplate(emailData.template, { name });
  await transporter.sendMail({
    from: '"Saphahemailservice" <youremail@gmail.com>',
    to,
    subject: emailData.subject,
    html
  });
}

// === LOAD TEMPLATE FUNCTION ===
import fs from 'fs/promises';
async function getTemplate(templateName, vars = {}) {
  let html = await fs.readFile(`./templates/${templateName}`, 'utf8');
  for (const [key, value] of Object.entries(vars)) {
    html = html.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  return html;
}

// === RUN AUTOMATICALLY AT 08:00 SAST ===
async function runDaily() {
  const now = nowSAST();
  const targetHour = 8;
  const targetMinute = 0;

  const nextRun = new Date(now);
  nextRun.setHours(targetHour, targetMinute, 0, 0);

  if (now > nextRun) nextRun.setDate(nextRun.getDate() + 1);
  const msUntilRun = nextRun - now;

  console.log(
    `⏰ Next funnel check scheduled for ${format(nextRun, 'yyyy-MM-dd HH:mm')} SAST`
  );

  setTimeout(async () => {
    await processFunnelEmails();
    runDaily();
  }, msUntilRun);
}

// Start the scheduler
runDaily();
