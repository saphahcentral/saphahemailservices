// firebase-admin.js
import admin from "firebase-admin";
import { readFileSync } from "fs";

const serviceAccountPath = process.env.FIREBASE_ADMIN_KEY_PATH || "./serviceAccountKey.json";
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

export const db = admin.firestore();
