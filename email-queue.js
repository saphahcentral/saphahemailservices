// email-queue.js
import { sendEmail } from "./email-send.js";
import { logEmail } from "./email-logger.js";

const queue = [];

// Add a new email to the queue
export function queueEmail(to, subject, body) {
  queue.push({ to, subject, body, retries: 0 });
  logEmail("Queue", { to, subject });
}

// Process queue automatically
export async function processQueue() {
  for (let i = 0; i < queue.length; i++) {
    const job = queue[i];
    const result = await sendEmail(job.to, job.subject, job.body);

    if (result.success) {
      logEmail("Sent", { to: job.to, id: result.messageId });
      queue.splice(i, 1); // remove from queue
      i--; // adjust index
    } else if (job.retries < 3) {
      job.retries++;
      logEmail("Retry", { to: job.to, retries: job.retries });
    } else {
      logEmail("Failed", { to: job.to, error: result.error });
      queue.splice(i, 1);
      i--;
    }
  }
}

// Background runner
setInterval(processQueue, 5000); // every 5 seconds
