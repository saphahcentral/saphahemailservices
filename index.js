// index.js
import { sendNextEmailBatch } from "./sendNextEmail.js";

(async () => {
  console.log("🚀 Starting automated email send...");
  await sendNextEmailBatch();
  console.log("✅ Email send cycle complete.");
})();
