import { createHash } from "node:crypto";
import type { ProviderId } from "../oauth/providers";

export const RULE_LEVELS = ["busy", "title", "title_location", "full"] as const;
export type RuleLevel = (typeof RULE_LEVELS)[number];

export const RULE_LEVEL_INFO: Record<RuleLevel, { label: string; description: string }> = {
  busy: { label: "Busy only", description: "Shows the time as \"Busy\". No title or other details." },
  title: { label: "Title only", description: "Title and time." },
  title_location: { label: "Title + location", description: "Title, time and location." },
  full: { label: "Full details", description: "Title, time, location, description, video link and attendee names." },
};

export const isRuleLevel = (x: unknown): x is RuleLevel => typeof x === "string" && (RULE_LEVELS as readonly string[]).includes(x);

export type CalendarRole = "hub" | "spoke";

/** users/{uid}/calendars/{calendarId}: a calendar chosen for syncing. */
export interface CalendarRecord {
  id: string;
  accountId: string;
  provider: ProviderId;
  providerCalendarId: string;
  name: string;
  color?: string;
  role: CalendarRole;
  addedAt: Date;
}

/** users/{uid}/rules/{ruleId} */
export interface RuleRecord {
  id: string;
  name: string;
  level: RuleLevel;
  createdAt: Date;
  updatedAt: Date;
}

/** users/{uid}/edges/{spokeCalendarId}: hub → spoke, one per spoke calendar. */
export interface EdgeRecord {
  id: string;
  spokeCalendarId: string;
  ruleId: string | null;
  enabled: boolean;
  updatedAt: Date;
}

export interface SetupRepo {
  listCalendars(uid: string): Promise<CalendarRecord[]>;
  getCalendar(uid: string, id: string): Promise<CalendarRecord | null>;
  /** Makes `cal` the hub calendar, replacing any previous hub calendar. */
  setHubCalendar(uid: string, cal: CalendarRecord): Promise<void>;
  /** Adds a spoke calendar together with a disabled, rule-less edge. */
  addSpokeCalendar(uid: string, cal: CalendarRecord, now: Date): Promise<void>;
  /** Removes a calendar and its edge. */
  removeCalendar(uid: string, id: string): Promise<void>;
  removeCalendarsForAccount(uid: string, accountId: string): Promise<void>;

  listRules(uid: string): Promise<RuleRecord[]>;
  getRule(uid: string, id: string): Promise<RuleRecord | null>;
  createRule(uid: string, r: { name: string; level: RuleLevel }, now: Date): Promise<string>;
  updateRule(uid: string, id: string, r: { name: string; level: RuleLevel }, now: Date): Promise<void>;
  /** Throws rule_in_use when an edge still references it. */
  deleteRule(uid: string, id: string): Promise<void>;

  listEdges(uid: string): Promise<EdgeRecord[]>;
  updateEdge(uid: string, id: string, e: { ruleId: string | null; enabled: boolean }, now: Date): Promise<void>;
}

/** Deterministic, Firestore-safe id for a provider calendar under an account. */
export function calendarIdFor(accountId: string, providerCalendarId: string): string {
  return `${accountId}~${createHash("sha256").update(providerCalendarId).digest("hex").slice(0, 16)}`;
}

export const isCalendarId = (x: string) => /^[A-Za-z0-9._-]{1,200}~[0-9a-f]{16}$/.test(x);
export const isDocId = (x: string) => /^[A-Za-z0-9_-]{1,64}$/.test(x);
