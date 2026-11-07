import "server-only";
import { AccessTokenService } from "./accounts/accessTokens";
import { FirestoreAccountRepo } from "./accounts/firestoreRepo";
import { FirestoreSetupRepo } from "./setup/firestoreRepo";
import type { SetupDeps } from "./setup/service";
import { loadConfig } from "./config";
import { createTokenCipher } from "./crypto/tokenCipher";
import { adminDb } from "./firebaseAdmin";

let cached: Promise<SetupDeps> | undefined;

/** Process-wide dependencies for route handlers and server components. */
export function getDeps(): Promise<SetupDeps> {
  cached ??= (async () => {
    const config = loadConfig();
    const db = adminDb();
    const repo = new FirestoreAccountRepo(db);
    const cipher = await createTokenCipher(config);
    return { config, repo, cipher, setup: new FirestoreSetupRepo(db), tokens: new AccessTokenService({ config, repo, cipher }) };
  })().catch((e) => {
    cached = undefined; // retry on the next request instead of caching the failure
    throw e;
  });
  return cached;
}
