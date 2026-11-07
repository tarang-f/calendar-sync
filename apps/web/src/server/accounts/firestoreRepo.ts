import type { DocumentData, Firestore, Timestamp } from "firebase-admin/firestore";
import type { AccountRecord, AccountRepo, AccountStatus, UserRecord } from "./types";

const toDate = (v: unknown): Date => (v instanceof Date ? v : (v as Timestamp).toDate());

/**
 * Firestore layout:
 *   logins/{accountId}                 → { uid }        hub-login index
 *   users/{uid}                        → UserRecord
 *   users/{uid}/accounts/{accountId}   → AccountRecord
 */
export class FirestoreAccountRepo implements AccountRepo {
  constructor(private readonly db: Firestore) {}

  private user(uid: string) {
    return this.db.collection("users").doc(uid);
  }
  private accounts(uid: string) {
    return this.user(uid).collection("accounts");
  }

  async findOrCreateUserForLogin(accountId: string, email: string, now: Date) {
    const loginRef = this.db.collection("logins").doc(accountId);
    return this.db.runTransaction(async (tx) => {
      const login = await tx.get(loginRef);
      const existing = login.get("uid");
      if (typeof existing === "string") return { uid: existing, created: false };
      const userRef = this.db.collection("users").doc();
      tx.create(userRef, { email, hubAccountId: accountId, createdAt: now });
      tx.create(loginRef, { uid: userRef.id, createdAt: now });
      return { uid: userRef.id, created: true };
    });
  }

  async getUser(uid: string): Promise<UserRecord | null> {
    const snap = await this.user(uid).get();
    if (!snap.exists) return null;
    const d = snap.data()!;
    return { uid, email: d.email, hubAccountId: d.hubAccountId, hubCalendarId: d.hubCalendarId ?? undefined, createdAt: toDate(d.createdAt) };
  }

  async upsertAccount(uid: string, a: AccountRecord): Promise<void> {
    const { id, connectedAt, ...rest } = a;
    const ref = this.accounts(uid).doc(id);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      // Keep the original connectedAt when reconnecting.
      tx.set(ref, { ...stripUndefined(rest), connectedAt: snap.exists ? snap.get("connectedAt") : connectedAt });
    });
  }

  async getAccount(uid: string, accountId: string): Promise<AccountRecord | null> {
    const snap = await this.accounts(uid).doc(accountId).get();
    return snap.exists ? fromDoc(snap.id, snap.data()!) : null;
  }

  async listAccounts(uid: string): Promise<AccountRecord[]> {
    const q = await this.accounts(uid).orderBy("connectedAt").get();
    return q.docs.map((d) => fromDoc(d.id, d.data()));
  }

  async deleteAccount(uid: string, accountId: string): Promise<void> {
    await this.accounts(uid).doc(accountId).delete();
  }

  async setAccountStatus(uid: string, accountId: string, status: AccountStatus, now: Date): Promise<void> {
    await this.accounts(uid).doc(accountId).update({ status, updatedAt: now });
  }

  async updateRefreshToken(uid: string, accountId: string, encRefreshToken: string, now: Date): Promise<void> {
    await this.accounts(uid).doc(accountId).update({ encRefreshToken, updatedAt: now });
  }
}

function fromDoc(id: string, d: DocumentData): AccountRecord {
  return {
    id,
    provider: d.provider,
    subject: d.subject,
    email: d.email,
    name: d.name,
    scopes: d.scopes ?? [],
    encRefreshToken: d.encRefreshToken,
    status: d.status,
    connectedAt: toDate(d.connectedAt),
    updatedAt: toDate(d.updatedAt),
  };
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}
