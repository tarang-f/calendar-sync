import { createHash } from "node:crypto";
import type { AppConfig } from "../config";
import { codeChallengeS256, randomToken } from "./pkce";
import { isProviderId, type ProviderId } from "./providers";

/**
 * A tiny fake OAuth/OIDC provider for local development and tests. It behaves like
 * Google/Microsoft closely enough to exercise the real flow: authorize → code → token
 * (with PKCE check) → refresh token + id_token. Disabled unless OAUTH_MOCK=1 and not production.
 */
export const mockEnabled = (cfg: AppConfig) => cfg.oauthMock && !cfg.isProduction;

interface MockCode {
  provider: ProviderId;
  email: string;
  scope: string;
  codeChallenge: string;
  redirectUri: string;
}

/** Only redirect back to this app's own callback URLs. */
export function isAllowedRedirect(cfg: AppConfig, uri: string | null): uri is string {
  return !!uri && uri.startsWith(`${cfg.appUrl}/api/auth/callback/`);
}

export function issueMockCode(c: MockCode): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

function readMockCode(code: string): MockCode | null {
  try {
    const c = JSON.parse(Buffer.from(code, "base64url").toString("utf8")) as MockCode;
    return isProviderId(c.provider) && typeof c.email === "string" ? c : null;
  } catch {
    return null;
  }
}

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const unsignedJwt = (claims: object) => `${b64({ alg: "none", typ: "JWT" })}.${b64(claims)}.`;
const stableId = (email: string) => createHash("sha256").update(email).digest("hex").slice(0, 20);

/** Handles the token request body. Returns [status, json]. */
export function mockTokenResponse(form: URLSearchParams): [number, Record<string, unknown>] {
  if (form.get("grant_type") !== "authorization_code") return [400, { error: "unsupported_grant_type" }];
  const c = readMockCode(form.get("code") ?? "");
  if (!c) return [400, { error: "invalid_grant" }];
  if (form.get("redirect_uri") !== c.redirectUri) return [400, { error: "invalid_grant", error_description: "redirect_uri mismatch" }];
  if (codeChallengeS256(form.get("code_verifier") ?? "") !== c.codeChallenge) {
    return [400, { error: "invalid_grant", error_description: "PKCE verification failed" }];
  }
  const email = c.email.toLowerCase();
  const claims =
    c.provider === "google"
      ? { iss: "mock-google", sub: stableId(email), email, email_verified: true, name: email.split("@")[0] }
      : { iss: "mock-microsoft", tid: "mock-tenant", oid: stableId(email), preferred_username: email, name: email.split("@")[0] };
  return [
    200,
    {
      token_type: "Bearer",
      access_token: `mock-access-${randomToken(12)}`,
      refresh_token: `mock-refresh-${randomToken(12)}`,
      expires_in: 3600,
      scope: c.scope,
      id_token: unsignedJwt(claims),
    },
  ];
}
