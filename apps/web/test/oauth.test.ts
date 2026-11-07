import { describe, expect, it } from "vitest";
import { codeChallengeS256 } from "@/server/oauth/pkce";
import {
  buildAuthorizeUrl,
  decodeJwtPayload,
  exchangeCode,
  hasScopes,
  identityFromClaims,
  providerSpec,
} from "@/server/oauth/providers";
import { decodeState, encodeState, STATE_TTL_MS } from "@/server/oauth/state";
import { AuthError } from "@/server/oauth/errors";
import { testConfig } from "./helpers";

const realCfg = testConfig({ OAUTH_MOCK: "0", GOOGLE_OAUTH_CLIENT_ID: "gid", GOOGLE_OAUTH_CLIENT_SECRET: "gsec", MICROSOFT_OAUTH_CLIENT_ID: "mid", MICROSOFT_OAUTH_CLIENT_SECRET: "msec" });

describe("PKCE", () => {
  it("matches the RFC 7636 test vector", () => {
    expect(codeChallengeS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("authorize URL", () => {
  it("requests offline calendar access from Google", () => {
    const u = new URL(buildAuthorizeUrl(providerSpec("google", realCfg), { redirectUri: "http://localhost:3000/api/auth/callback/google", state: "s", codeChallenge: "c" }));
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(u.searchParams.get("client_id")).toBe("gid");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/calendar.events");
  });

  it("requests offline_access + Calendars.ReadWrite from Microsoft", () => {
    const u = new URL(buildAuthorizeUrl(providerSpec("microsoft", realCfg), { redirectUri: "x", state: "s", codeChallenge: "c" }));
    expect(u.host).toBe("login.microsoftonline.com");
    expect(u.pathname).toBe("/common/oauth2/v2.0/authorize");
    expect(u.searchParams.get("scope")!.split(" ")).toEqual(expect.arrayContaining(["offline_access", "Calendars.ReadWrite"]));
  });

  it("points at the local mock provider in mock mode", () => {
    const u = new URL(buildAuthorizeUrl(providerSpec("google", testConfig()), { redirectUri: "x", state: "s", codeChallenge: "c" }));
    expect(u.pathname).toBe("/api/auth/mock/authorize");
    expect(u.searchParams.get("provider")).toBe("google");
  });

  it("never enables the mock in production", () => {
    expect(testConfig({ APP_ENV: "production" }).oauthMock).toBe(false);
    expect(testConfig({ NODE_ENV: "production" }).oauthMock).toBe(false);
  });
});

describe("scopes", () => {
  it("compares by last path segment, case-insensitively", () => {
    expect(hasScopes(["https://graph.microsoft.com/Calendars.ReadWrite", "openid"], ["calendars.readwrite"])).toBe(true);
    expect(hasScopes(["openid", "email"], ["https://www.googleapis.com/auth/calendar.events"])).toBe(false);
  });
});

describe("token exchange", () => {
  const spec = providerSpec("google", realCfg);
  const reply = (status: number, json: object) => async () => Response.json(json, { status });
  const p = { code: "c", codeVerifier: "v", redirectUri: "r" };
  const idToken = `x.${Buffer.from(JSON.stringify({ sub: "1", email: "a@b.c" })).toString("base64url")}.`;
  const full = "openid https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly";

  it("returns tokens on success", async () => {
    const t = await exchangeCode(spec, p, reply(200, { access_token: "a", refresh_token: "r", id_token: idToken, expires_in: 3600, scope: full }));
    expect(t.refreshToken).toBe("r");
  });

  it.each([
    [{ access_token: "a", id_token: idToken, scope: full }, "no_refresh_token"],
    [{ access_token: "a", refresh_token: "r", id_token: idToken, scope: "openid email" }, "missing_scopes"],
  ])("rejects %j with %s", async (json, code) => {
    await expect(exchangeCode(spec, p, reply(200, json))).rejects.toMatchObject({ code });
  });

  it("maps HTTP errors to token_exchange_failed", async () => {
    await expect(exchangeCode(spec, p, reply(400, { error: "invalid_grant" }))).rejects.toBeInstanceOf(AuthError);
  });
});

describe("identity", () => {
  it("uses tid.oid and preferred_username for Microsoft", () => {
    expect(identityFromClaims("microsoft", { tid: "t", oid: "o", preferred_username: "Me@Outlook.com" })).toMatchObject({ subject: "t.o", email: "me@outlook.com" });
  });
  it("uses sub and email for Google", () => {
    expect(identityFromClaims("google", { sub: "123", email: "me@gmail.com" })).toMatchObject({ subject: "123", email: "me@gmail.com" });
  });
  it("rejects claims without an email", () => {
    expect(() => identityFromClaims("google", { sub: "1" })).toThrow(AuthError);
  });
  it("rejects malformed JWTs", () => {
    expect(() => decodeJwtPayload("nope")).toThrow(AuthError);
  });
});

describe("state cookie", () => {
  const s = { state: "abc", codeVerifier: "v", provider: "google" as const, mode: "login" as const, createdAt: 1000 };
  it("round-trips", () => expect(decodeState(encodeState(s), 2000)).toEqual(s));
  it("expires", () => expect(decodeState(encodeState(s), 1000 + STATE_TTL_MS + 1)).toBeNull());
  it("rejects garbage", () => {
    expect(decodeState("%%%", 2000)).toBeNull();
    expect(decodeState(Buffer.from('{"state":1}').toString("base64url"), 2000)).toBeNull();
  });
});
