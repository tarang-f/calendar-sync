import type { AccessTokenService } from "../accounts/accessTokens";
import { toSummary, type AccountRecord, type AccountSummary } from "../accounts/types";
import type { FlowDeps } from "../auth/flow";
import { AppError, type AppErrorCode } from "../errors";
import { listCalendars, type ProviderCalendar } from "../providers";
import {
  calendarIdFor,
  isCalendarId,
  isDocId,
  isRuleLevel,
  type CalendarRecord,
  type EdgeRecord,
  type RuleRecord,
  type SetupRepo,
} from "./types";

export interface SetupDeps extends FlowDeps {
  setup: SetupRepo;
  tokens: AccessTokenService;
}

const now = (d: SetupDeps) => new Date(d.now?.() ?? Date.now());

async function requireUser(d: SetupDeps, uid: string) {
  const user = await d.repo.getUser(uid);
  if (!user) throw new AppError("not_signed_in");
  return user;
}

async function requireAccount(d: SetupDeps, uid: string, accountId: string) {
  const a = await d.repo.getAccount(uid, accountId);
  if (!a) throw new AppError("account_not_found");
  return a;
}

async function providerCalendars(d: SetupDeps, uid: string, account: AccountRecord) {
  const token = await d.tokens.get(uid, account);
  try {
    return await listCalendars(d.config, account.provider, token, d.fetch);
  } catch (e) {
    if (e instanceof AppError && e.code === "needs_reauth") d.tokens.invalidate(uid, account.id);
    throw e;
  }
}

async function findProviderCalendar(d: SetupDeps, uid: string, account: AccountRecord, providerCalendarId: string) {
  const cal = (await providerCalendars(d, uid, account)).find((c) => c.providerCalendarId === providerCalendarId);
  if (!cal) throw new AppError("calendar_not_found");
  return cal;
}

// ---------- Calendars ----------

export interface AccountCalendars {
  account: AccountSummary;
  isHubAccount: boolean;
  calendars: Array<ProviderCalendar & { id: string; selectedAs?: "hub" | "spoke" }>;
  error?: AppErrorCode;
}

/** Every connected account with its live calendar list, marked with what's selected. */
export async function listAccountCalendars(d: SetupDeps, uid: string): Promise<AccountCalendars[]> {
  const [user, accounts, selected] = await Promise.all([requireUser(d, uid), d.repo.listAccounts(uid), d.setup.listCalendars(uid)]);
  const roles = new Map(selected.map((c) => [c.id, c.role]));
  return Promise.all(
    accounts.map(async (account): Promise<AccountCalendars> => {
      const base = { account: toSummary(account), isHubAccount: account.id === user.hubAccountId };
      try {
        const cals = await providerCalendars(d, uid, account);
        return {
          ...base,
          calendars: cals.map((c) => {
            const id = calendarIdFor(account.id, c.providerCalendarId);
            return { ...c, id, selectedAs: roles.get(id) };
          }),
        };
      } catch (e) {
        const code = e instanceof AppError ? e.code : "server_error";
        // Re-read status so the page shows "needs reconnecting" right away.
        return { ...base, account: { ...base.account, status: code === "needs_reauth" ? "needs_reauth" : base.account.status }, calendars: [], error: code };
      }
    }),
  );
}

function record(account: AccountRecord, c: ProviderCalendar, role: "hub" | "spoke", at: Date): CalendarRecord {
  return {
    id: calendarIdFor(account.id, c.providerCalendarId),
    accountId: account.id,
    provider: account.provider,
    providerCalendarId: c.providerCalendarId,
    name: c.name,
    color: c.color,
    role,
    addedAt: at,
  };
}

export async function setHubCalendar(d: SetupDeps, uid: string, accountId: string, providerCalendarId: string) {
  const user = await requireUser(d, uid);
  if (accountId !== user.hubAccountId) throw new AppError("hub_must_be_on_hub_account");
  const account = await requireAccount(d, uid, accountId);
  const cal = await findProviderCalendar(d, uid, account, providerCalendarId);
  if (!cal.canWrite) throw new AppError("calendar_read_only");
  const rec = record(account, cal, "hub", now(d));
  const existing = await d.setup.getCalendar(uid, rec.id);
  if (existing?.role === "spoke") throw new AppError("hub_cannot_be_spoke");
  await d.setup.setHubCalendar(uid, rec);
}

export async function addSpokeCalendar(d: SetupDeps, uid: string, accountId: string, providerCalendarId: string) {
  const user = await requireUser(d, uid);
  const account = await requireAccount(d, uid, accountId);
  const cal = await findProviderCalendar(d, uid, account, providerCalendarId);
  if (!cal.canWrite) throw new AppError("calendar_read_only");
  const rec = record(account, cal, "spoke", now(d));
  if (rec.id === user.hubCalendarId) throw new AppError("hub_cannot_be_spoke");
  if (await d.setup.getCalendar(uid, rec.id)) return; // already a spoke
  await d.setup.addSpokeCalendar(uid, rec, now(d));
}

export async function removeSpokeCalendar(d: SetupDeps, uid: string, calendarId: string) {
  if (!isCalendarId(calendarId)) throw new AppError("calendar_not_found");
  const cal = await d.setup.getCalendar(uid, calendarId);
  if (!cal || cal.role !== "spoke") throw new AppError("calendar_not_found");
  await d.setup.removeCalendar(uid, calendarId); // copies already made stay (plan §11)
}

// ---------- Rules ----------

function parseRule(name: unknown, level: unknown) {
  const n = typeof name === "string" ? name.trim() : "";
  if (!n || n.length > 60 || !isRuleLevel(level)) throw new AppError("invalid_input");
  return { name: n, level };
}

export async function createRule(d: SetupDeps, uid: string, name: unknown, level: unknown) {
  await requireUser(d, uid);
  return d.setup.createRule(uid, parseRule(name, level), now(d));
}

export async function updateRule(d: SetupDeps, uid: string, ruleId: string, name: unknown, level: unknown) {
  if (!isDocId(ruleId) || !(await d.setup.getRule(uid, ruleId))) throw new AppError("rule_not_found");
  await d.setup.updateRule(uid, ruleId, parseRule(name, level), now(d));
}

export async function deleteRule(d: SetupDeps, uid: string, ruleId: string) {
  if (!isDocId(ruleId) || !(await d.setup.getRule(uid, ruleId))) throw new AppError("rule_not_found");
  await d.setup.deleteRule(uid, ruleId);
}

// ---------- Edges ----------

export async function updateEdge(d: SetupDeps, uid: string, edgeId: string, ruleId: string | null, enabled: boolean) {
  const user = await requireUser(d, uid);
  if (!isCalendarId(edgeId) || !(await d.setup.getCalendar(uid, edgeId))) throw new AppError("calendar_not_found");
  if (ruleId !== null && (!isDocId(ruleId) || !(await d.setup.getRule(uid, ruleId)))) throw new AppError("rule_not_found");
  if (enabled && !ruleId) throw new AppError("rule_required");
  if (enabled && !user.hubCalendarId) throw new AppError("no_hub_calendar");
  await d.setup.updateEdge(uid, edgeId, { ruleId, enabled }, now(d));
}

// ---------- Overview ----------

export interface SpokeView {
  calendar: CalendarRecord;
  account?: AccountSummary;
  edge?: EdgeRecord;
  rule?: RuleRecord;
}

export interface SetupOverview {
  hub?: { calendar: CalendarRecord; account?: AccountSummary };
  spokes: SpokeView[];
  rules: RuleRecord[];
  /** Number of edges using each rule. */
  ruleUsage: Record<string, number>;
}

export async function getSetupOverview(d: SetupDeps, uid: string): Promise<SetupOverview> {
  const [user, accounts, calendars, rules, edges] = await Promise.all([
    requireUser(d, uid),
    d.repo.listAccounts(uid),
    d.setup.listCalendars(uid),
    d.setup.listRules(uid),
    d.setup.listEdges(uid),
  ]);
  const acc = new Map(accounts.map((a) => [a.id, toSummary(a)]));
  const ruleById = new Map(rules.map((r) => [r.id, r]));
  const edgeById = new Map(edges.map((e) => [e.id, e]));
  const hubCal = calendars.find((c) => c.id === user.hubCalendarId);
  const ruleUsage: Record<string, number> = {};
  for (const e of edges) if (e.ruleId) ruleUsage[e.ruleId] = (ruleUsage[e.ruleId] ?? 0) + 1;
  return {
    hub: hubCal ? { calendar: hubCal, account: acc.get(hubCal.accountId) } : undefined,
    spokes: calendars
      .filter((c) => c.role === "spoke")
      .map((c) => {
        const edge = edgeById.get(c.id);
        return { calendar: c, account: acc.get(c.accountId), edge, rule: edge?.ruleId ? ruleById.get(edge.ruleId) : undefined };
      }),
    rules,
    ruleUsage,
  };
}
