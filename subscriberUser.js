// saphahemailservices/main/subscribeUser.js
import { db } from "./firebase-admin.js";

export async function subscribeUser(name, email) {
  const now = new Date();

  const subscriberRef = db.collection("subscribers").doc(email);
  const subscriberSnap = await subscriberRef.get();

  if (subscriberSnap.exists) {
    console.log(`Subscriber ${email} already exists.`);
    return { status: "exists" };
  }

  const newSubscriber = {
    name,
    email,
    joined_date: now.toISOString(),
    confirmed: true,
    welcome_sent: false,
    sequence_index: 0,
    next_send_date: now.toISOString(),
    unsubscribed: false
  };

  await subscriberRef.set(newSubscriber);
  console.log(`New subscriber added: ${email}`);

  return { status: "ok" };
}
