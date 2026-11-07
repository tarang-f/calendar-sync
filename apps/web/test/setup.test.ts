import { describe, expect, it } from "vitest";
import { disconnectAccount } from "@/server/auth/flow";
import { mockGoogleCalendarList, mockGraphCalendars } from "@/server/oauth/mock";
import {
  addSpokeCalendar,
  createRule,
  deleteRule,
  getSetupOverview,
  listAccountCalendars,
  removeSpokeCalendar,
  setHubCalendar,
  updateEdge,
  updateRule,
} from "@/server/setup/service";
import { calendarIdFor } from "@/server/setup/types";
import { hubUser, makeDeps, signIn, type TestDeps } from "./helpers";

const g = (email: string) => mockGoogleCalendarList(email).items;
const m = (email: string) => mockGraphCalendars(email).value;

/** Hub user (Google) + one Microsoft spoke account. */
async function world() {
  const d = makeDeps();
  const hub = await hubUser(d);
  const spoke = await signIn(d, "microsoft", "me@work.com", "connect", hub.uid);
  if (!spoke.ok) throw new Error();
  return { d, uid: hub.uid, hubAcc: hub.accountId, msAcc: spoke.accountId };
}

describe("access tokens", () => {
  it("caches access tokens until close to expiry", async () => {
    const { d, uid, hubAcc } = await world();
    const acct = (await d.repo.getAccount(uid, hubAcc))!;
    const t1 = await d.tokens.get(uid, acct);
    expect(await d.tokens.get(uid, acct)).toBe(t1);
    (d as TestDeps & { advance(ms: number): void }).advance(3600_000);
    expect(await d.tokens.get(uid, acct)).not.toBe(t1);
  });

  it("stores rotated refresh tokens (Microsoft)", async () => {
    const { d, uid, msAcc } = await world();
    const before = (await d.repo.getAccount(uid, msAcc))!.encRefreshToken;
    await d.tokens.get(uid, (await d.repo.getAccount(uid, msAcc))!);
    expect((await d.repo.getAccount(uid, msAcc))!.encRefreshToken).not.toBe(before);
  });

  it("flags revoked accounts as needs_reauth", async () => {
    const d = makeDeps();
    const hub = await hubUser(d);
    const bad = await signIn(d, "google", "revoked@gmail.com", "connect", hub.uid);
    if (!bad.ok) throw new Error();
    await expect(d.tokens.get(hub.uid, (await d.repo.getAccount(hub.uid, bad.accountId))!)).rejects.toMatchObject({ code: "needs_reauth" });
    expect((await d.repo.getAccount(hub.uid, bad.accountId))!.status).toBe("needs_reauth");
  });
});

describe("calendar selection", () => {
  it("lists each account's calendars with errors isolated per account", async () => {
    const { d, uid } = await world();
    await signIn(d, "google", "revoked@gmail.com", "connect", uid);
    const list = await listAccountCalendars(d, uid);
    expect(list.map((a) => [a.account.email, a.isHubAccount, a.calendars.length, a.error])).toEqual([
      ["me@gmail.com", true, 4, undefined],
      ["me@work.com", false, 3, undefined],
      ["revoked@gmail.com", false, 0, "needs_reauth"],
    ]);
    expect(list[2].account.status).toBe("needs_reauth");
  });

  it("sets the hub calendar from the hub account only", async () => {
    const { d, uid, hubAcc, msAcc } = await world();
    await expect(setHubCalendar(d, uid, msAcc, m("me@work.com")[0].id)).rejects.toMatchObject({ code: "hub_must_be_on_hub_account" });
    await expect(setHubCalendar(d, uid, hubAcc, g("me@gmail.com")[3].id)).rejects.toMatchObject({ code: "calendar_read_only" });
    await expect(setHubCalendar(d, uid, hubAcc, "nope")).rejects.toMatchObject({ code: "calendar_not_found" });
    await setHubCalendar(d, uid, hubAcc, "me@gmail.com");
    expect((await d.repo.getUser(uid))!.hubCalendarId).toBe(calendarIdFor(hubAcc, "me@gmail.com"));
  });

  it("replacing the hub calendar removes the old one", async () => {
    const { d, uid, hubAcc } = await world();
    await setHubCalendar(d, uid, hubAcc, "me@gmail.com");
    await setHubCalendar(d, uid, hubAcc, g("me@gmail.com")[1].id);
    const cals = await d.setup.listCalendars(uid);
    expect(cals.map((c) => [c.name, c.role])).toEqual([["Work", "hub"]]);
  });

  it("adds spokes (writable only, never the hub) idempotently", async () => {
    const { d, uid, hubAcc, msAcc } = await world();
    await setHubCalendar(d, uid, hubAcc, "me@gmail.com");
    await expect(addSpokeCalendar(d, uid, hubAcc, "me@gmail.com")).rejects.toMatchObject({ code: "hub_cannot_be_spoke" });
    await expect(addSpokeCalendar(d, uid, msAcc, m("me@work.com")[2].id)).rejects.toMatchObject({ code: "calendar_read_only" });
    await addSpokeCalendar(d, uid, msAcc, m("me@work.com")[0].id);
    await addSpokeCalendar(d, uid, msAcc, m("me@work.com")[0].id);
    await addSpokeCalendar(d, uid, hubAcc, g("me@gmail.com")[1].id); // other calendar on the hub account
    const o = await getSetupOverview(d, uid);
    expect(o.hub?.calendar.name).toBe("me@gmail.com");
    expect(o.spokes.map((s) => [s.calendar.name, s.edge?.enabled, s.edge?.ruleId])).toEqual([["Calendar", false, null], ["Work", false, null]]);
  });

  it("a spoke can't become the hub until removed", async () => {
    const { d, uid, hubAcc } = await world();
    const work = g("me@gmail.com")[1].id;
    await addSpokeCalendar(d, uid, hubAcc, work);
    await expect(setHubCalendar(d, uid, hubAcc, work)).rejects.toMatchObject({ code: "hub_cannot_be_spoke" });
    await removeSpokeCalendar(d, uid, calendarIdFor(hubAcc, work));
    await setHubCalendar(d, uid, hubAcc, work);
  });

  it("removes spokes and their edges; rejects bad ids", async () => {
    const { d, uid, msAcc } = await world();
    await addSpokeCalendar(d, uid, msAcc, m("me@work.com")[1].id);
    const id = calendarIdFor(msAcc, m("me@work.com")[1].id);
    await removeSpokeCalendar(d, uid, id);
    expect(await d.setup.listEdges(uid)).toEqual([]);
    await expect(removeSpokeCalendar(d, uid, id)).rejects.toMatchObject({ code: "calendar_not_found" });
    await expect(removeSpokeCalendar(d, uid, "../../x")).rejects.toMatchObject({ code: "calendar_not_found" });
  });

  it("disconnecting an account removes its calendars and edges", async () => {
    const { d, uid, msAcc } = await world();
    await addSpokeCalendar(d, uid, msAcc, m("me@work.com")[0].id);
    await disconnectAccount(d, uid, msAcc);
    expect(await d.setup.listCalendars(uid)).toEqual([]);
    expect(await d.setup.listEdges(uid)).toEqual([]);
  });
});

describe("rules and edges", () => {
  it("validates rule input", async () => {
    const { d, uid } = await world();
    await expect(createRule(d, uid, "  ", "busy")).rejects.toMatchObject({ code: "invalid_input" });
    await expect(createRule(d, uid, "x".repeat(61), "busy")).rejects.toMatchObject({ code: "invalid_input" });
    await expect(createRule(d, uid, "Work", "everything")).rejects.toMatchObject({ code: "invalid_input" });
    const id = await createRule(d, uid, "  Work → Personal ", "busy");
    expect((await d.setup.getRule(uid, id))!.name).toBe("Work → Personal");
    await updateRule(d, uid, id, "Renamed", "full");
    expect((await d.setup.getRule(uid, id))).toMatchObject({ name: "Renamed", level: "full" });
    await expect(updateRule(d, uid, "missing", "x", "busy")).rejects.toMatchObject({ code: "rule_not_found" });
  });

  it("assigns rules to edges and guards enabling", async () => {
    const { d, uid, hubAcc, msAcc } = await world();
    const cal = m("me@work.com")[0].id;
    await addSpokeCalendar(d, uid, msAcc, cal);
    const edgeId = calendarIdFor(msAcc, cal);
    const rule = await createRule(d, uid, "Busy", "busy");

    await expect(updateEdge(d, uid, edgeId, null, true)).rejects.toMatchObject({ code: "rule_required" });
    await expect(updateEdge(d, uid, edgeId, rule, true)).rejects.toMatchObject({ code: "no_hub_calendar" });
    await expect(updateEdge(d, uid, edgeId, "missing", false)).rejects.toMatchObject({ code: "rule_not_found" });
    await updateEdge(d, uid, edgeId, rule, false);

    await setHubCalendar(d, uid, hubAcc, "me@gmail.com");
    await updateEdge(d, uid, edgeId, rule, true);
    const o = await getSetupOverview(d, uid);
    expect(o.spokes[0]).toMatchObject({ edge: { enabled: true, ruleId: rule }, rule: { name: "Busy" } });
    expect(o.ruleUsage).toEqual({ [rule]: 1 });
  });

  it("can't delete a rule that's in use", async () => {
    const { d, uid, msAcc } = await world();
    const cal = m("me@work.com")[0].id;
    await addSpokeCalendar(d, uid, msAcc, cal);
    const rule = await createRule(d, uid, "Busy", "busy");
    await updateEdge(d, uid, calendarIdFor(msAcc, cal), rule, false);
    await expect(deleteRule(d, uid, rule)).rejects.toMatchObject({ code: "rule_in_use" });
    await updateEdge(d, uid, calendarIdFor(msAcc, cal), null, false);
    await deleteRule(d, uid, rule);
    expect(await d.setup.listRules(uid)).toEqual([]);
  });
});
