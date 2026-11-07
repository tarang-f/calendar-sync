import type { AppConfig } from "../config";
import type { TokenCipher } from "../crypto/tokenCipher";
import { accountIdFor, tokenAad, type AccountRepo } from "../accounts/types";
import { AppError } from "../errors";
import { codeChallengeS256, randomToken } from "../oauth/pkce";
import {
  buildAuthorizeUrl,
  decodeJwtPayload,
  exchangeCode,
  identityFromClaims,
  providerSpec,
  redirectUri,
  type FetchLike,
  type ProviderId,
} from "../oauth/providers";
import { decodeState, encodeState, type AuthMode } from "../oauth/state";
import type { SetupRepo } from "../setup/types";

export interface FlowDeps {
  config: AppConfig;
  repo: AccountRepo;
  /** When present, disconnecting an account also removes its selected calendars. */
  setup?: Pick<SetupRepo, "removeCalendarsForAccount">;
  cipher: TokenCipher;
  fetch?: FetchLike;
  now?: () => number;
}

export { tokenAad };

/** Step 1: build the provider redirect and the state cookie value. */
export function startAuth(deps: FlowDeps, provider: ProviderId, mode: AuthMode) {
  const now = deps.now?.() ?? Date.now();
  const state = randomToken();
  const codeVerifier = randomToken(48);
  const spec = providerSpec(provider, deps.config);
  const url = buildAuthorizeUrl(spec, {
    redirectUri: redirectUri(deps.config, provider),
    state,
    codeChallenge: codeChallengeS256(codeVerifier),
  });
  return { redirectUrl: url, stateCookie: encodeState({ state, codeVerifier, provider, mode, createdAt: now }) };
}

export interface CallbackInput {
  provider: ProviderId;
  query: URLSearchParams;
  stateCookie: string | undefined;
  /** Signed-in user, if any. Required for mode=connect. */
  sessionUid: string | null;
}

export type CallbackResult =
  | { ok: true; mode: AuthMode; uid: string; accountId: string; created: boolean }
  | { ok: false; mode: AuthMode; error: AppError };

/** Step 2: validate the provider's redirect, exchange the code and store the account. */
export async function completeAuth(deps: FlowDeps, input: CallbackInput): Promise<CallbackResult> {
  const nowMs = deps.now?.() ?? Date.now();
  const st = decodeState(input.stateCookie, nowMs);
  const mode: AuthMode = st?.mode ?? (input.sessionUid ? "connect" : "login");
  try {
    if (!st || st.provider !== input.provider || input.query.get("state") !== st.state) {
      throw new AppError("invalid_state");
    }
    const providerError = input.query.get("error");
    if (providerError) {
      throw new AppError(providerError === "access_denied" ? "access_denied" : "token_exchange_failed", providerError);
    }
    const code = input.query.get("code");
    if (!code) throw new AppError("missing_code");
    if (st.mode === "connect" && !input.sessionUid) throw new AppError("not_signed_in");

    const spec = providerSpec(input.provider, deps.config);
    const tokens = await exchangeCode(
      spec,
      { code, codeVerifier: st.codeVerifier, redirectUri: redirectUri(deps.config, input.provider) },
      deps.fetch,
    );
    const identity = identityFromClaims(input.provider, decodeJwtPayload(tokens.idToken));
    const accountId = accountIdFor(identity.provider, identity.subject);
    const now = new Date(nowMs);

    let uid: string;
    let created = false;
    if (st.mode === "login") {
      ({ uid, created } = await deps.repo.findOrCreateUserForLogin(accountId, identity.email, now));
    } else {
      uid = input.sessionUid!;
    }

    await deps.repo.upsertAccount(uid, {
      id: accountId,
      provider: identity.provider,
      subject: identity.subject,
      email: identity.email,
      name: identity.name,
      scopes: tokens.scopes,
      encRefreshToken: await deps.cipher.encrypt(tokens.refreshToken, tokenAad(uid, accountId)),
      status: "active",
      connectedAt: now,
      updatedAt: now,
    });
    return { ok: true, mode: st.mode, uid, accountId, created };
  } catch (e) {
    const error = e instanceof AppError ? e : new AppError("server_error", (e as Error).message);
    return { ok: false, mode, error };
  }
}

/** Removes a spoke account. Copies it already created are left in place (plan §11). */
export async function disconnectAccount(deps: FlowDeps, uid: string, accountId: string): Promise<void> {
  if (!/^[A-Za-z0-9._-]{1,200}$/.test(accountId)) throw new AppError("account_not_found");
  const user = await deps.repo.getUser(uid);
  if (!user) throw new AppError("not_signed_in");
  if (user.hubAccountId === accountId) throw new AppError("cannot_disconnect_hub");
  const account = await deps.repo.getAccount(uid, accountId);
  if (!account) throw new AppError("account_not_found");

  await deps.setup?.removeCalendarsForAccount(uid, accountId);
  await deps.repo.deleteAccount(uid, accountId);

  // Best effort: revoke Google grants. Microsoft has no per-app revoke endpoint for users.
  if (account.provider === "google" && !deps.config.oauthMock) {
    try {
      const token = await deps.cipher.decrypt(account.encRefreshToken, tokenAad(uid, accountId));
      await (deps.fetch ?? fetch)("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
      });
    } catch {
      /* ignore: the account is already removed locally */
    }
  }
}
