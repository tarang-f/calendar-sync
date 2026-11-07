import "server-only";
import { FirestoreAccountRepo } from "./accounts/firestoreRepo";
import type { FlowDeps } from "./auth/flow";
import { loadConfig } from "./config";
import { createTokenCipher } from "./crypto/tokenCipher";
import { adminDb } from "./firebaseAdmin";

let cached: Promise<FlowDeps> | undefined;

/** Process-wide dependencies for route handlers and server components. */
export function getDeps(): Promise<FlowDeps> {
  cached ??= (async () => {
    const config = loadConfig();
    return { config, repo: new FirestoreAccountRepo(adminDb()), cipher: await createTokenCipher(config) };
  })().catch((e) => {
    cached = undefined; // retry on the next request instead of caching the failure
    throw e;
  });
  return cached;
}
