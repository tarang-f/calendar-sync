import { randomUUID } from "node:crypto";
import type { MemoryAccountRepo } from "../accounts/memoryRepo";
import { AppError } from "../errors";
import type { CalendarRecord, EdgeRecord, RuleLevel, RuleRecord, SetupRepo } from "./types";

/** In-memory SetupRepo for tests. Shares users with a MemoryAccountRepo for hubCalendarId. */
export class MemorySetupRepo implements SetupRepo {
  calendars = new Map<string, Map<string, CalendarRecord>>();
  rules = new Map<string, Map<string, RuleRecord>>();
  edges = new Map<string, Map<string, EdgeRecord>>();

  constructor(private readonly accounts: MemoryAccountRepo) {}

  private m<T>(store: Map<string, Map<string, T>>, uid: string) {
    let x = store.get(uid);
    if (!x) store.set(uid, (x = new Map()));
    return x;
  }

  async listCalendars(uid: string) {
    return [...this.m(this.calendars, uid).values()].sort((a, b) => +a.addedAt - +b.addedAt);
  }
  async getCalendar(uid: string, id: string) {
    return this.m(this.calendars, uid).get(id) ?? null;
  }
  async setHubCalendar(uid: string, cal: CalendarRecord) {
    const user = this.accounts.users.get(uid)!;
    if (user.hubCalendarId && user.hubCalendarId !== cal.id) this.m(this.calendars, uid).delete(user.hubCalendarId);
    this.m(this.calendars, uid).set(cal.id, cal);
    user.hubCalendarId = cal.id;
  }
  async addSpokeCalendar(uid: string, cal: CalendarRecord, now: Date) {
    this.m(this.calendars, uid).set(cal.id, cal);
    this.m(this.edges, uid).set(cal.id, { id: cal.id, spokeCalendarId: cal.id, ruleId: null, enabled: false, updatedAt: now });
  }
  async removeCalendar(uid: string, id: string) {
    this.m(this.calendars, uid).delete(id);
    this.m(this.edges, uid).delete(id);
  }
  async removeCalendarsForAccount(uid: string, accountId: string) {
    for (const c of await this.listCalendars(uid)) if (c.accountId === accountId) await this.removeCalendar(uid, c.id);
  }
  async listRules(uid: string) {
    return [...this.m(this.rules, uid).values()].sort((a, b) => +a.createdAt - +b.createdAt);
  }
  async getRule(uid: string, id: string) {
    return this.m(this.rules, uid).get(id) ?? null;
  }
  async createRule(uid: string, r: { name: string; level: RuleLevel }, now: Date) {
    const id = randomUUID().replace(/-/g, "").slice(0, 20);
    this.m(this.rules, uid).set(id, { id, ...r, createdAt: now, updatedAt: now });
    return id;
  }
  async updateRule(uid: string, id: string, r: { name: string; level: RuleLevel }, now: Date) {
    const x = this.m(this.rules, uid).get(id);
    if (x) Object.assign(x, r, { updatedAt: now });
  }
  async deleteRule(uid: string, id: string) {
    if ([...this.m(this.edges, uid).values()].some((e) => e.ruleId === id)) throw new AppError("rule_in_use");
    this.m(this.rules, uid).delete(id);
  }
  async listEdges(uid: string) {
    return [...this.m(this.edges, uid).values()];
  }
  async updateEdge(uid: string, id: string, e: { ruleId: string | null; enabled: boolean }, now: Date) {
    const x = this.m(this.edges, uid).get(id);
    if (x) Object.assign(x, e, { updatedAt: now });
  }
}
