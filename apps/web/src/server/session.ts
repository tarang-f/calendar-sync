import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { AppConfig } from "./config";
import { adminAuth } from "./firebaseAdmin";

export const SESSION_COOKIE = "__session";
/** Firebase session cookies can last at most 14 days. */
export const SESSION_MAX_AGE_S = 14 * 24 * 60 * 60;

/**
 * Mints a Firebase session cookie for `uid`, entirely server-side:
 * custom token → ID token (Identity Toolkit REST) → session cookie.
 */
export async function createSessionCookie(cfg: AppConfig, uid: string): Promise<string> {
  const customToken = await adminAuth().createCustomToken(uid);
  const base = cfg.authEmulatorHost
    ? `http://${cfg.authEmulatorHost}/identitytoolkit.googleapis.com`
    : "https://identitytoolkit.googleapis.com";
  const res = await fetch(`${base}/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(cfg.firebaseApiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  const json = (await res.json()) as { idToken?: string; error?: { message?: string } };
  if (!res.ok || !json.idToken) throw new Error(`signInWithCustomToken failed: ${json.error?.message ?? res.status}`);
  return adminAuth().createSessionCookie(json.idToken, { expiresIn: SESSION_MAX_AGE_S * 1000 });
}

/** The signed-in user's uid, or null. Checks revocation (sign-out elsewhere). */
export async function getSessionUid(): Promise<string | null> {
  // Session checks hit Firebase Auth and the clock: always run at request time,
  // never during prerendering or runtime prefetching.
  await connection();
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    return (await adminAuth().verifySessionCookie(raw, true)).uid;
  } catch {
    return null;
  }
}

export function cookieOptions(cfg: AppConfig, maxAgeS: number) {
  return {
    httpOnly: true,
    secure: cfg.appUrl.startsWith("https://"),
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeS,
  };
}
