import type { ProviderId } from "../oauth/providers";

export type AccountStatus = "active" | "needs_reauth";

export interface UserRecord {
  uid: string;
  email: string;
  hubAccountId: string;
  /** Set once the user picks a hub calendar (Phase 2). */
  hubCalendarId?: string;
  createdAt: Date;
}

/** users/{uid}/accounts/{accountId}. `encRefreshToken` never leaves the server. */
export interface AccountRecord {
  id: string;
  provider: ProviderId;
  subject: string;
  email: string;
  name?: string;
  scopes: string[];
  encRefreshToken: string;
  status: AccountStatus;
  connectedAt: Date;
  updatedAt: Date;
}

/** Safe-to-render view of an account. */
export type AccountSummary = Omit<AccountRecord, "encRefreshToken" | "subject">;

export interface AccountRepo {
  /** Resolves the user for a hub login, creating the user on first sign-in. */
  findOrCreateUserForLogin(accountId: string, email: string, now: Date): Promise<{ uid: string; created: boolean }>;
  getUser(uid: string): Promise<UserRecord | null>;
  upsertAccount(uid: string, account: AccountRecord): Promise<void>;
  getAccount(uid: string, accountId: string): Promise<AccountRecord | null>;
  listAccounts(uid: string): Promise<AccountRecord[]>;
  deleteAccount(uid: string, accountId: string): Promise<void>;
  setAccountStatus(uid: string, accountId: string, status: AccountStatus, now: Date): Promise<void>;
  updateRefreshToken(uid: string, accountId: string, encRefreshToken: string, now: Date): Promise<void>;
}

/** Binds an encrypted refresh token to its owner (AES-GCM / KMS additional authenticated data). */
export const tokenAad = (uid: string, accountId: string) => `${uid}/${accountId}`;

/** Deterministic, Firestore-safe document id for a provider account. */
export function accountIdFor(provider: ProviderId, subject: string): string {
  return `${provider}_${subject.replace(/[^A-Za-z0-9._-]/g, "_")}`;
}

export function toSummary(a: AccountRecord): AccountSummary {
  return {
    id: a.id,
    provider: a.provider,
    email: a.email,
    name: a.name,
    scopes: a.scopes,
    status: a.status,
    connectedAt: a.connectedAt,
    updatedAt: a.updatedAt,
  };
}
