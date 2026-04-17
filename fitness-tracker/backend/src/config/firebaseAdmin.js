import fs from "fs";
import path from "path";
import admin from "firebase-admin";

const defaultServiceAccountPath = path.resolve(process.cwd(), "serviceAccountKey.json");
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || defaultServiceAccountPath;

if (!admin.apps.length) {
  let initialized = false;

  if (fs.existsSync(serviceAccountPath)) {
    const rawServiceAccount = fs.readFileSync(serviceAccountPath, "utf8");
    const serviceAccount = JSON.parse(rawServiceAccount);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    initialized = true;
  }

  if (!initialized) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (projectId && clientEmail && privateKey) {
      admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      });
      initialized = true;
    }
  }

  if (!initialized) {
    admin.initializeApp();
  }
}

export default admin;
