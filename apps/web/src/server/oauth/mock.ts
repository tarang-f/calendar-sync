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

interface MockSubject {
  p: ProviderId;
  e: string;
}

/** Mock tokens carry the provider + email so later API calls know who's calling. */
const mintToken = (kind: "access" | "refresh", sub: MockSubject) => `mock-${kind}.${b64(sub)}.${randomToken(9)}`;

export function readMockToken(kind: "access" | "refresh", token: string | null | undefined): MockSubject | null {
  const m = token?.match(new RegExp(`^mock-${kind}\\.([A-Za-z0-9_-]+)\\.`));
  if (!m) return null;
  try {
    const sub = JSON.parse(Buffer.from(m[1], "base64url").toString("utf8")) as MockSubject;
    return isProviderId(sub.p) && typeof sub.e === "string" ? sub : null;
  } catch {
    return null;
  }
}

/** Emails containing "revoked" sign in fine but fail every refresh, to exercise reconnect flows. */
const isRevoked = (email: string) => email.includes("revoked");

/** Handles the token request body (authorization_code and refresh_token grants). Returns [status, json]. */
export function mockTokenResponse(form: URLSearchParams): [number, Record<string, unknown>] {
  const grant = form.get("grant_type");
  if (grant === "refresh_token") {
    const sub = readMockToken("refresh", form.get("refresh_token"));
    if (!sub || isRevoked(sub.e)) return [400, { error: "invalid_grant", error_description: "refresh token revoked" }];
    return [
      200,
      {
        token_type: "Bearer",
        access_token: mintToken("access", sub),
        expires_in: 3600,
        // Microsoft rotates refresh tokens; Google doesn't.
        ...(sub.p === "microsoft" ? { refresh_token: mintToken("refresh", sub) } : {}),
      },
    ];
  }
  if (grant !== "authorization_code") return [400, { error: "unsupported_grant_type" }];
  const c = readMockCode(form.get("code") ?? "");
  if (!c) return [400, { error: "invalid_grant" }];
  if (form.get("redirect_uri") !== c.redirectUri) return [400, { error: "invalid_grant", error_description: "redirect_uri mismatch" }];
  if (codeChallengeS256(form.get("code_verifier") ?? "") !== c.codeChallenge) {
    return [400, { error: "invalid_grant", error_description: "PKCE verification failed" }];
  }
  const email = c.email.toLowerCase();
  const sub = { p: c.provider, e: email };
  const claims =
    c.provider === "google"
      ? { iss: "mock-google", sub: stableId(email), email, email_verified: true, name: email.split("@")[0] }
      : { iss: "mock-microsoft", tid: "mock-tenant", oid: stableId(email), preferred_username: email, name: email.split("@")[0] };
  return [
    200,
    {
      token_type: "Bearer",
      access_token: mintToken("access", sub),
      refresh_token: mintToken("refresh", sub),
      expires_in: 3600,
      scope: c.scope,
      id_token: unsignedJwt(claims),
    },
  ];
}

/** Bearer token → caller, or null (→ 401). */
export function mockCaller(authorization: string | null, provider: ProviderId): MockSubject | null {
  const sub = readMockToken("access", authorization?.replace(/^Bearer\s+/i, ""));
  return sub && sub.p === provider ? sub : null;
}

/** Google calendarList.list response for a mock user. */
export function mockGoogleCalendarList(email: string) {
  const h = stableId(email).slice(0, 8);
  return {
    kind: "calendar#calendarList",
    items: [
      { id: email, summary: email, primary: true, accessRole: "owner", backgroundColor: "#4285f4" },
      { id: `work-${h}@group.calendar.google.com`, summary: "Work", accessRole: "owner", backgroundColor: "#0b8043" },
      { id: `family-${h}@group.calendar.google.com`, summary: "Family", accessRole: "writer", backgroundColor: "#f4511e" },
      { id: "en.usa#holiday@group.v.calendar.google.com", summary: "Holidays", accessRole: "reader", backgroundColor: "#9e69af" },
    ],
  };
}

/** Microsoft Graph GET /me/calendars response for a mock user. */
export function mockGraphCalendars(email: string) {
  const h = stableId(email).slice(0, 8);
  return {
    value: [
      { id: `AAMk${h}-default=`, name: "Calendar", canEdit: true, isDefaultCalendar: true, hexColor: "#0078d4" },
      { id: `AAMk${h}-team/x=`, name: "Team", canEdit: true, isDefaultCalendar: false, hexColor: "" },
      { id: `AAMk${h}-birthdays=`, name: "Birthdays", canEdit: false, isDefaultCalendar: false, hexColor: "" },
    ],
  };
}
