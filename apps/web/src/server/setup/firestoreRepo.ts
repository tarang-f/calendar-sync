import type { DocumentData, Firestore, Timestamp } from "firebase-admin/firestore";
import { AppError } from "../errors";
import type { CalendarRecord, EdgeRecord, RuleLevel, RuleRecord, SetupRepo } from "./types";

const toDate = (v: unknown): Date => (v instanceof Date ? v : (v as Timestamp).toDate());
const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/**
 *   users/{uid}                 hubCalendarId
 *   users/{uid}/calendars/{id}  CalendarRecord
 *   users/{uid}/rules/{id}      RuleRecord
 *   users/{uid}/edges/{id}      EdgeRecord (id = spoke calendar id)
 */
export class FirestoreSetupRepo implements SetupRepo {
  constructor(private readonly db: Firestore) {}

  private user = (uid: string) => this.db.collection("users").doc(uid);
  private calendars = (uid: string) => this.user(uid).collection("calendars");
  private rules = (uid: string) => this.user(uid).collection("rules");
  private edges = (uid: string) => this.user(uid).collection("edges");

  async listCalendars(uid: string) {
    const q = await this.calendars(uid).orderBy("addedAt").get();
    return q.docs.map((d) => calFrom(d.id, d.data()));
  }

  async getCalendar(uid: string, id: string) {
    const s = await this.calendars(uid).doc(id).get();
    return s.exists ? calFrom(s.id, s.data()!) : null;
  }

  async setHubCalendar(uid: string, cal: CalendarRecord) {
    await this.db.runTransaction(async (tx) => {
      const user = await tx.get(this.user(uid));
      const prev = user.get("hubCalendarId");
      if (typeof prev === "string" && prev !== cal.id) tx.delete(this.calendars(uid).doc(prev));
      const { id, ...data } = cal;
      tx.set(this.calendars(uid).doc(id), clean(data));
      tx.update(this.user(uid), { hubCalendarId: id });
    });
  }

  async addSpokeCalendar(uid: string, cal: CalendarRecord, now: Date) {
    const { id, ...data } = cal;
    const batch = this.db.batch();
    batch.set(this.calendars(uid).doc(id), clean(data));
    batch.set(this.edges(uid).doc(id), { spokeCalendarId: id, ruleId: null, enabled: false, updatedAt: now });
    await batch.commit();
  }

  async removeCalendar(uid: string, id: string) {
    const batch = this.db.batch();
    batch.delete(this.calendars(uid).doc(id));
    batch.delete(this.edges(uid).doc(id));
    await batch.commit();
  }

  async removeCalendarsForAccount(uid: string, accountId: string) {
    const q = await this.calendars(uid).where("accountId", "==", accountId).get();
    if (q.empty) return;
    const batch = this.db.batch();
    for (const d of q.docs) {
      batch.delete(d.ref);
      batch.delete(this.edges(uid).doc(d.id));
    }
    await batch.commit();
  }

  async listRules(uid: string) {
    const q = await this.rules(uid).orderBy("createdAt").get();
    return q.docs.map((d) => ruleFrom(d.id, d.data()));
  }

  async getRule(uid: string, id: string) {
    const s = await this.rules(uid).doc(id).get();
    return s.exists ? ruleFrom(s.id, s.data()!) : null;
  }

  async createRule(uid: string, r: { name: string; level: RuleLevel }, now: Date) {
    const ref = await this.rules(uid).add({ ...r, createdAt: now, updatedAt: now });
    return ref.id;
  }

  async updateRule(uid: string, id: string, r: { name: string; level: RuleLevel }, now: Date) {
    await this.rules(uid).doc(id).update({ ...r, updatedAt: now });
  }

  async deleteRule(uid: string, id: string) {
    await this.db.runTransaction(async (tx) => {
      const used = await tx.get(this.edges(uid).where("ruleId", "==", id).limit(1));
      if (!used.empty) throw new AppError("rule_in_use");
      tx.delete(this.rules(uid).doc(id));
    });
  }

  async listEdges(uid: string) {
    const q = await this.edges(uid).get();
    return q.docs.map((d) => edgeFrom(d.id, d.data()));
  }

  async updateEdge(uid: string, id: string, e: { ruleId: string | null; enabled: boolean }, now: Date) {
    await this.edges(uid).doc(id).update({ ...e, updatedAt: now });
  }
}

function calFrom(id: string, d: DocumentData): CalendarRecord {
  return {
    id,
    accountId: d.accountId,
    provider: d.provider,
    providerCalendarId: d.providerCalendarId,
    name: d.name,
    color: d.color,
    role: d.role,
    addedAt: toDate(d.addedAt),
  };
}
const ruleFrom = (id: string, d: DocumentData): RuleRecord => ({
  id,
  name: d.name,
  level: d.level,
  createdAt: toDate(d.createdAt),
  updatedAt: toDate(d.updatedAt),
});
const edgeFrom = (id: string, d: DocumentData): EdgeRecord => ({
  id,
  spokeCalendarId: d.spokeCalendarId,
  ruleId: d.ruleId ?? null,
  enabled: !!d.enabled,
  updatedAt: toDate(d.updatedAt),
});
