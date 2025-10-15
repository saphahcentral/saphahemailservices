// saphahemailservices/main/sendNextEmail.js
import { db } from "./firebase-admin.js";
import { sendEmail } from "./sendEmail.js";
import fs from "fs";
import path from "path";

const funFolder = "./FUNNEL";
const weekdaysOnly = true;

function isWeekend(date) {
  const day = date.getDay(); // Sunday=0, Saturday=6
  return day === 0 || day === 6;
}

export async function sendNextEmailBatch() {
  const now = new Date();

  if (weekdaysOnly && isWeekend(now)) {
    console.log("Weekend detected — skipping auto-sequence.");
    return;
  }

  const subs = await db.collection("subscribers")
    .where("unsubscribed", "==", false)
    .where("next_send_date", "<=", now.toISOString())
    .get();

  for (const doc of subs.docs) {
    const sub = doc.data();
    const idx = sub.sequence_index + 1;
    const emailPath = path.join(funFolder, `email${idx}.txt`);

    if (!fs.existsSync(emailPath)) {
      console.log(`No more emails for ${sub.email}`);
      continue;
    }

    const header = fs.readFileSync(path.join(funFolder, "header.txt"), "utf8");
    const footer = fs.readFileSync(path.join(funFolder, "footer.txt"), "utf8");
    const body = fs.readFileSync(emailPath, "utf8");

    const content = `${header}\n\n${body}\n\n${footer}`;
    await sendEmail(sub.email, `Message ${idx}`, content);

    // Schedule next weekday
    const next = new Date(now);
    next.setDate(now.getDate() + 1);
    while (isWeekend(next)) next.setDate(next.getDate() + 1);

    await db.collection("subscribers").doc(sub.email).update({
      sequence_index: idx,
      next_send_date: next.toISOString(),
      welcome_sent: true
    });

    console.log(`Sent Email #${idx} to ${sub.email}`);
  }
}
