import type { AppConfig } from "../config";
import type { TokenCipher } from "../crypto/tokenCipher";
import { AppError } from "../errors";
import { providerSpec, refreshAccessToken, type FetchLike } from "../oauth/providers";
import { tokenAad, type AccountRecord, type AccountRepo } from "./types";

interface Deps {
  config: AppConfig;
  repo: AccountRepo;
  cipher: TokenCipher;
  fetch?: FetchLike;
  now?: () => number;
}

/** Refresh this long before expiry. */
const SKEW_MS = 60_000;

/**
 * Hands out short-lived access tokens for connected accounts. Caches per process,
 * stores rotated refresh tokens, and flags accounts whose grant was revoked.
 */
export class AccessTokenService {
  private readonly cache = new Map<string, { token: string; expiresAt: number }>();

  constructor(private readonly deps: Deps) {}

  private now() {
    return this.deps.now?.() ?? Date.now();
  }

  async get(uid: string, account: AccountRecord): Promise<string> {
    if (account.status === "needs_reauth") throw new AppError("needs_reauth");
    const key = tokenAad(uid, account.id);
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt - SKEW_MS > this.now()) return hit.token;

    const { config, repo, cipher } = this.deps;
    const refreshToken = await cipher.decrypt(account.encRefreshToken, key);
    let r;
    try {
      r = await refreshAccessToken(providerSpec(account.provider, config), refreshToken, this.deps.fetch);
    } catch (e) {
      this.cache.delete(key);
      if (e instanceof AppError && e.code === "needs_reauth") {
        await repo.setAccountStatus(uid, account.id, "needs_reauth", new Date(this.now()));
      }
      throw e;
    }
    if (r.refreshToken && r.refreshToken !== refreshToken) {
      await repo.updateRefreshToken(uid, account.id, await cipher.encrypt(r.refreshToken, key), new Date(this.now()));
    }
    this.cache.set(key, { token: r.accessToken, expiresAt: this.now() + r.expiresIn * 1000 });
    return r.accessToken;
  }

  /** Forget a cached token, e.g. after the provider rejected it. */
  invalidate(uid: string, accountId: string) {
    this.cache.delete(tokenAad(uid, accountId));
  }
}
