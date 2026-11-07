import { createHash, randomBytes } from "node:crypto";

/** URL-safe random string (default 32 bytes → 43 chars). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** RFC 7636 S256 code challenge. */
export function codeChallengeS256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
