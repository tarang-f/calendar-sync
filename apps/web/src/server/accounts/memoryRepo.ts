import { randomUUID } from "node:crypto";
import type { AccountRecord, AccountRepo, AccountStatus, UserRecord } from "./types";

/** In-memory AccountRepo for unit tests. */
export class MemoryAccountRepo implements AccountRepo {
  logins = new Map<string, string>();
  users = new Map<string, UserRecord>();
  accounts = new Map<string, Map<string, AccountRecord>>();

  async findOrCreateUserForLogin(accountId: string, email: string, now: Date) {
    const existing = this.logins.get(accountId);
    if (existing) return { uid: existing, created: false };
    const uid = randomUUID();
    this.users.set(uid, { uid, email, hubAccountId: accountId, createdAt: now });
    this.logins.set(accountId, uid);
    return { uid, created: true };
  }
  async getUser(uid: string) {
    return this.users.get(uid) ?? null;
  }
  async upsertAccount(uid: string, a: AccountRecord) {
    const m = this.accounts.get(uid) ?? new Map<string, AccountRecord>();
    const prev = m.get(a.id);
    m.set(a.id, { ...a, connectedAt: prev?.connectedAt ?? a.connectedAt });
    this.accounts.set(uid, m);
  }
  async getAccount(uid: string, id: string) {
    return this.accounts.get(uid)?.get(id) ?? null;
  }
  async listAccounts(uid: string) {
    return [...(this.accounts.get(uid)?.values() ?? [])].sort((a, b) => +a.connectedAt - +b.connectedAt);
  }
  async deleteAccount(uid: string, id: string) {
    this.accounts.get(uid)?.delete(id);
  }
  async setAccountStatus(uid: string, id: string, status: AccountStatus, now: Date) {
    const a = this.accounts.get(uid)?.get(id);
    if (a) Object.assign(a, { status, updatedAt: now });
  }
  async updateRefreshToken(uid: string, id: string, encRefreshToken: string, now: Date) {
    const a = this.accounts.get(uid)?.get(id);
    if (a) Object.assign(a, { encRefreshToken, updatedAt: now });
  }
}
