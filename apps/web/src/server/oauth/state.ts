import type { ProviderId } from "./providers";
import { isProviderId } from "./providers";

export type AuthMode = "login" | "connect";

export interface OAuthState {
  state: string;
  codeVerifier: string;
  provider: ProviderId;
  mode: AuthMode;
  createdAt: number;
}

export const STATE_COOKIE = "oauth_state";
export const STATE_TTL_MS = 10 * 60 * 1000;

export function encodeState(s: OAuthState): string {
  return Buffer.from(JSON.stringify(s), "utf8").toString("base64url");
}

/** Returns null when the cookie is missing, malformed or expired. */
export function decodeState(raw: string | undefined, now: number): OAuthState | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const s = v as Partial<OAuthState>;
  if (
    typeof s.state !== "string" ||
    typeof s.codeVerifier !== "string" ||
    !isProviderId(s.provider) ||
    (s.mode !== "login" && s.mode !== "connect") ||
    typeof s.createdAt !== "number"
  ) {
    return null;
  }
  if (now - s.createdAt > STATE_TTL_MS || s.createdAt > now + 60_000) return null;
  return s as OAuthState;
}
