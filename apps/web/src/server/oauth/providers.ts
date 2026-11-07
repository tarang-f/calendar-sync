import type { AppConfig } from "../config";
import { AppError } from "../errors";

export const PROVIDER_IDS = ["google", "microsoft"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  google: "Google",
  microsoft: "Microsoft",
};

export function isProviderId(x: unknown): x is ProviderId {
  return typeof x === "string" && (PROVIDER_IDS as readonly string[]).includes(x);
}

export interface ProviderSpec {
  id: ProviderId;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  /** Scopes that must be granted; compared by their last path segment, case-insensitively. */
  requiredScopes: string[];
  extraAuthParams: Record<string, string>;
  clientId: string;
  clientSecret: string;
}

const GOOGLE_CAL_EVENTS = "https://www.googleapis.com/auth/calendar.events";
const GOOGLE_CAL_LIST = "https://www.googleapis.com/auth/calendar.calendarlist.readonly";

export function providerSpec(id: ProviderId, cfg: AppConfig): ProviderSpec {
  const mock = cfg.oauthMock;
  const mockAuthorize = `${cfg.appUrl}/api/auth/mock/authorize?provider=${id}`;
  const mockToken = `${cfg.appUrl}/api/auth/mock/token`;

  if (id === "google") {
    return {
      id,
      authorizeUrl: mock ? mockAuthorize : "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: mock ? mockToken : "https://oauth2.googleapis.com/token",
      scopes: ["openid", "email", GOOGLE_CAL_EVENTS, GOOGLE_CAL_LIST],
      requiredScopes: [GOOGLE_CAL_EVENTS, GOOGLE_CAL_LIST],
      // offline + consent guarantees a refresh token on every grant.
      extraAuthParams: { access_type: "offline", prompt: "consent select_account", include_granted_scopes: "true" },
      ...cfg.google,
    };
  }
  return {
    id,
    authorizeUrl: mock ? mockAuthorize : "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: mock ? mockToken : "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: ["openid", "email", "offline_access", "User.Read", "Calendars.ReadWrite"],
    requiredScopes: ["Calendars.ReadWrite"],
    extraAuthParams: { response_mode: "query", prompt: "select_account" },
    ...cfg.microsoft,
  };
}

export function redirectUri(cfg: AppConfig, id: ProviderId): string {
  return `${cfg.appUrl}/api/auth/callback/${id}`;
}

export function buildAuthorizeUrl(
  spec: ProviderSpec,
  p: { redirectUri: string; state: string; codeChallenge: string },
): string {
  const url = new URL(spec.authorizeUrl);
  const params: Record<string, string> = {
    response_type: "code",
    client_id: spec.clientId,
    redirect_uri: p.redirectUri,
    scope: spec.scopes.join(" "),
    state: p.state,
    code_challenge: p.codeChallenge,
    code_challenge_method: "S256",
    ...spec.extraAuthParams,
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  idToken: string;
  scopes: string[];
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function exchangeCode(
  spec: ProviderSpec,
  p: { code: string; codeVerifier: string; redirectUri: string },
  fetchImpl: FetchLike = fetch,
): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: p.code,
    code_verifier: p.codeVerifier,
    redirect_uri: p.redirectUri,
    client_id: spec.clientId,
    client_secret: spec.clientSecret,
  });
  let res: Response;
  try {
    res = await fetchImpl(spec.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body,
    });
  } catch (e) {
    throw new AppError("token_exchange_failed", `token request failed: ${(e as Error).message}`);
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new AppError("token_exchange_failed", `token endpoint ${res.status}: ${String(json.error ?? "")}`);
  }
  const refreshToken = typeof json.refresh_token === "string" ? json.refresh_token : "";
  if (!refreshToken) throw new AppError("no_refresh_token");
  if (typeof json.id_token !== "string" || typeof json.access_token !== "string") {
    throw new AppError("token_exchange_failed", "token response missing access_token or id_token");
  }
  const scopes = typeof json.scope === "string" ? json.scope.split(/\s+/).filter(Boolean) : [];
  if (!hasScopes(scopes, spec.requiredScopes)) throw new AppError("missing_scopes");

  return {
    accessToken: json.access_token,
    refreshToken,
    expiresIn: Number(json.expires_in ?? 0),
    idToken: json.id_token,
    scopes,
  };
}

const scopeKey = (s: string) => (s.split("/").pop() ?? s).toLowerCase();

export function hasScopes(granted: string[], required: string[]): boolean {
  const g = new Set(granted.map(scopeKey));
  return required.every((r) => g.has(scopeKey(r)));
}

/**
 * Decodes a JWT payload without verifying its signature. Safe here only because the
 * token comes straight from the provider's token endpoint over TLS (OIDC Core §3.1.3.7).
 */
export function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split(".")[1];
  if (!part) throw new AppError("invalid_identity", "malformed id_token");
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    throw new AppError("invalid_identity", "undecodable id_token");
  }
}

export interface ProviderIdentity {
  provider: ProviderId;
  /** Stable, provider-unique user id. */
  subject: string;
  email: string;
  name?: string;
}

export function identityFromClaims(provider: ProviderId, c: Record<string, unknown>): ProviderIdentity {
  const str = (k: string) => (typeof c[k] === "string" && c[k] ? (c[k] as string) : undefined);
  const subject =
    provider === "microsoft" ? (str("tid") && str("oid") ? `${str("tid")}.${str("oid")}` : str("sub")) : str("sub");
  const email = str("email") ?? (provider === "microsoft" ? str("preferred_username") : undefined);
  if (!subject || !email) throw new AppError("invalid_identity", "id_token missing subject or email");
  return { provider, subject, email: email.toLowerCase(), name: str("name") };
}

export interface RefreshedToken {
  accessToken: string;
  expiresIn: number;
  /** Present when the provider rotated the refresh token (Microsoft does). */
  refreshToken?: string;
}

/** Exchanges a refresh token for a new access token. */
export async function refreshAccessToken(
  spec: ProviderSpec,
  refreshToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<RefreshedToken> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: spec.clientId,
    client_secret: spec.clientSecret,
  });
  let res: Response;
  try {
    res = await fetchImpl(spec.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body,
    });
  } catch (e) {
    throw new AppError("provider_unavailable", `refresh request failed: ${(e as Error).message}`);
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    // invalid_grant = revoked, expired or password changed: the user must reconnect.
    if (json.error === "invalid_grant" || res.status === 401) throw new AppError("needs_reauth", String(json.error ?? res.status));
    throw new AppError("provider_unavailable", `token endpoint ${res.status}: ${String(json.error ?? "")}`);
  }
  if (typeof json.access_token !== "string") throw new AppError("provider_unavailable", "no access_token in refresh response");
  return {
    accessToken: json.access_token,
    expiresIn: Number(json.expires_in ?? 3600),
    refreshToken: typeof json.refresh_token === "string" && json.refresh_token ? json.refresh_token : undefined,
  };
}
