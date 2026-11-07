import "server-only";
import { getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Uses Application Default Credentials on App Hosting. Locally, the emulator
 * env vars (FIREBASE_AUTH_EMULATOR_HOST, FIRESTORE_EMULATOR_HOST) plus
 * GCLOUD_PROJECT are enough — no credentials needed.
 */
function app(): App {
  return getApps()[0] ?? initializeApp(process.env.GCLOUD_PROJECT ? { projectId: process.env.GCLOUD_PROJECT } : undefined);
}

export const adminAuth = () => getAuth(app());
export const adminDb = () => getFirestore(app());
