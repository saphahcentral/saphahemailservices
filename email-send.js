// email-send.js
// Core email sending logic for internal services

export async function sendEmail(to, subject, body) {
  try {
    // Example: replace with real API (SMTP relay / 3rd party service)
    console.log(`[saphahemailservices] Sending email to ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body:\n${body}`);

    // Simulate async email sending
    return { success: true, messageId: Date.now().toString() };
  } catch (err) {
    console.error("Email send failed:", err);
    return { success: false, error: err.message };
  }
}
