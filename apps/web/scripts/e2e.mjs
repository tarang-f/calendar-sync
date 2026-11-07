// End-to-end check against a running app + Firebase emulators + mock OAuth:
// Phase 1 (sign-in, accounts) and Phase 2 (calendars, rules, sync settings).
// Usage: APP_URL=http://localhost:3000 node scripts/e2e-auth.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const jar = new Map();

function store(res) {
  for (const c of res.headers.getSetCookie()) {
    const [pair, ...attrs] = c.split(";");
    const i = pair.indexOf("=");
    const name = pair.slice(0, i).trim();
    const value = pair.slice(i + 1);
    const expired = attrs.some((a) => /max-age=0/i.test(a) || /expires=thu, 01 jan 1970/i.test(a));
    if (expired || value === "") jar.delete(name);
    else jar.set(name, value);
  }
}
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

async function req(path, init = {}) {
  const url = path.startsWith("http") ? path : BASE + path;
  const res = await fetch(url, { redirect: "manual", ...init, headers: { cookie: cookieHeader(), ...(init.headers ?? {}) } });
  store(res);
  return res;
}
const loc = (res) => new URL(res.headers.get("location"), BASE);

/** start → mock consent → callback. Returns the final redirect URL. */
async function oauth(provider, mode, email, decision = "allow") {
  const start = await req(`/api/auth/start/${provider}?mode=${mode}`);
  assert.equal(start.status, 302, `start ${provider}`);
  const authorize = loc(start);
  assert.equal(authorize.pathname, "/api/auth/mock/authorize");
  const page = await req(authorize.toString());
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Mock (Google|Microsoft) sign-in/);

  const approve = new URL("/api/auth/mock/approve", BASE);
  for (const k of ["provider", "redirect_uri", "state", "scope", "code_challenge"]) approve.searchParams.set(k, authorize.searchParams.get(k) ?? "");
  approve.searchParams.set("email", email);
  approve.searchParams.set("decision", decision);
  const back = await req(approve.toString());
  assert.equal(back.status, 302);
  const cb = await req(loc(back).toString());
  assert.equal(cb.status, 303, `callback ${provider}`);
  return loc(cb);
}

const accountsHtml = async () => (await (await req("/accounts")).text());
const page = async (path) => (await (await req(path)).text());

// Ids the mock provider produces (see src/server/oauth/mock.ts).
const stableId = (email) => createHash("sha256").update(email).digest("hex").slice(0, 20);
const googleAcc = (email) => `google_${stableId(email)}`;
const msAcc = (email) => `microsoft_mock-tenant.${stableId(email)}`;
const gCal = (email, name) => `${name}-${stableId(email).slice(0, 8)}@group.calendar.google.com`;
const msCal = (email, name) => `AAMk${stableId(email).slice(0, 8)}-${name}=`;

/** POST a form like the browser would; returns the redirect's query params. */
async function post(path, fields = {}) {
  const r = await req(path, {
    method: "POST",
    headers: { origin: BASE, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
  assert.equal(r.status, 303, `POST ${path} → ${r.status}`);
  return loc(r).searchParams;
}
const expectOk = async (path, fields, ok) => assert.equal((await post(path, fields)).get("ok"), ok, `${path} ok`);
const expectErr = async (path, fields, error) => assert.equal((await post(path, fields)).get("error"), error, `${path} error`);
const ME = "me@gmail.com";
const WORK = "me@work.com";
let ruleId;

const steps = [
  ["health", async () => assert.equal((await (await req("/api/health")).json()).status, "ok")],
  ["accounts requires sign-in", async () => assert.doesNotMatch(await accountsHtml(), /Signed in as/)],
  ["connect requires sign-in", async () => {
    const r = await req("/api/auth/start/microsoft?mode=connect");
    assert.equal(loc(r).searchParams.get("error"), "not_signed_in");
  }],
  ["denied consent", async () => {
    const r = await oauth("google", "login", "me@gmail.com", "deny");
    assert.equal(r.searchParams.get("error"), "access_denied");
    assert.ok(!jar.has("__session"));
  }],
  ["sign in with Google (hub)", async () => {
    const r = await oauth("google", "login", "me@gmail.com");
    assert.equal(r.pathname, "/accounts");
    assert.ok(jar.has("__session"), "session cookie set");
    assert.ok(!jar.has("oauth_state"), "state cookie cleared");
    const html = await accountsHtml();
    assert.match(html, /Signed in as/);
    assert.match(html, /me@gmail\.com/);
    assert.match(html, />Hub</);
  }],
  ["connect Microsoft spoke", async () => {
    const r = await oauth("microsoft", "connect", "me@work.com");
    assert.equal(r.pathname, "/accounts");
    assert.equal(r.searchParams.get("ok"), "connected");
    assert.match(await accountsHtml(), /me@work\.com/);
  }],
  ["connect second Google spoke", async () => {
    await oauth("google", "connect", "family@gmail.com");
    assert.match(await accountsHtml(), /family@gmail\.com/);
  }],
  ["calendars page lists every account's calendars", async () => {
    const html = await page("/calendars");
    for (const name of ["me@gmail.com", "Work", "Family", "Holidays", "Team", "Birthdays", "Read-only", "Make hub", "Add as spoke"]) assert.match(html, new RegExp(name));
  }],
  ["hub must be on the sign-in account", async () => {
    await expectErr("/api/calendars/hub", { accountId: msAcc(WORK), providerCalendarId: msCal(WORK, "default") }, "hub_must_be_on_hub_account");
  }],
  ["read-only calendars are rejected", async () => {
    await expectErr("/api/calendars/spokes", { accountId: msAcc(WORK), providerCalendarId: msCal(WORK, "birthdays") }, "calendar_read_only");
  }],
  ["choose hub calendar", async () => {
    await expectOk("/api/calendars/hub", { accountId: googleAcc(ME), providerCalendarId: ME }, "hub_set");
    assert.doesNotMatch(await accountsHtml(), /choose your hub calendar/);
  }],
  ["hub can't be a spoke", async () => {
    await expectErr("/api/calendars/spokes", { accountId: googleAcc(ME), providerCalendarId: ME }, "hub_cannot_be_spoke");
  }],
  ["add spokes from both accounts", async () => {
    await expectOk("/api/calendars/spokes", { accountId: msAcc(WORK), providerCalendarId: msCal(WORK, "default") }, "spoke_added");
    await expectOk("/api/calendars/spokes", { accountId: googleAcc(ME), providerCalendarId: gCal(ME, "work") }, "spoke_added");
    const html = await page("/sync");
    assert.match(html, /Calendar/);
    assert.match(html, /Work/);
    assert.match(html, /You need at least one rule/);
  }],
  ["enabling sync needs a rule", async () => {
    const edge = encodeURIComponent((await page("/sync")).match(/\/api\/edges\/([A-Za-z0-9._~%-]+)/)[1]);
    await expectErr(`/api/edges/${edge}`, { ruleId: "", enabled: "on" }, "rule_required");
  }],
  ["create and rename a rule", async () => {
    await expectErr("/api/rules", { name: " ", level: "busy" }, "invalid_input");
    await expectOk("/api/rules", { name: "Work blocks", level: "title" }, "rule_created");
    ruleId = (await page("/rules")).match(/\/api\/rules\/([A-Za-z0-9_-]+)\/update/)[1];
    await expectOk(`/api/rules/${ruleId}/update`, { name: "Busy blocks", level: "busy" }, "rule_saved");
    assert.match(await page("/rules"), /Busy blocks/);
  }],
  ["assign the rule and turn sync on", async () => {
    const html = await page("/sync");
    const edges = [...new Set([...html.matchAll(/\/api\/edges\/([A-Za-z0-9._~%-]+)/g)].map((m) => m[1]))];
    assert.equal(edges.length, 2);
    for (const e of edges) await expectOk(`/api/edges/${e}`, { ruleId, enabled: "on" }, "edge_saved");
    const after = await page("/sync");
    assert.match(after, /Busy only/);
    assert.equal((after.match(/checked=""/g) ?? []).length, 2);
    assert.match(await page("/rules"), /Used by 2 calendars/);
  }],
  ["a rule in use can't be deleted", async () => {
    await expectErr(`/api/rules/${ruleId}/delete`, {}, "rule_in_use");
  }],
  ["remove a spoke", async () => {
    const id = encodeURIComponent(`${googleAcc(ME)}~${createHash("sha256").update(gCal(ME, "work")).digest("hex").slice(0, 16)}`);
    await expectOk(`/api/calendars/${id}/remove`, {}, "spoke_removed");
    assert.match(await page("/rules"), /Used by 1 calendar</);
  }],
  ["cross-site POST is rejected", async () => {
    const r = await req("/api/auth/signout", { method: "POST", headers: { origin: "https://evil.example" } });
    assert.equal(r.status, 403);
  }],
  ["cannot disconnect hub", async () => {
    const html = await accountsHtml();
    const ids = [...new Set([...html.matchAll(/\/api\/accounts\/([^/"]+)\/disconnect/g)].map((m) => decodeURIComponent(m[1])))];
    assert.equal(ids.length, 2, "only spokes have a disconnect button");
    const hubId = "google_" + (await import("node:crypto")).createHash("sha256").update("me@gmail.com").digest("hex").slice(0, 20);
    const r = await req(`/api/accounts/${encodeURIComponent(hubId)}/disconnect`, { method: "POST", headers: { origin: BASE } });
    assert.equal(loc(r).searchParams.get("error"), "cannot_disconnect_hub");
  }],
  ["disconnect Microsoft spoke", async () => {
    const html = await accountsHtml();
    const id = [...html.matchAll(/\/api\/accounts\/([^/"]+)\/disconnect/g)].map((m) => m[1]).find((x) => x.startsWith("microsoft_"));
    const r = await req(`/api/accounts/${id}/disconnect`, { method: "POST", headers: { origin: BASE } });
    assert.equal(r.status, 303);
    assert.equal(loc(r).searchParams.get("ok"), "disconnected");
    assert.doesNotMatch(await accountsHtml(), /me@work\.com/);
    // Its calendars and sync settings went with it.
    assert.doesNotMatch(await page("/sync"), /me@work\.com/);
    assert.match(await page("/rules"), /Not used by any calendar/);
  }],
  ["revoked account shows reconnect", async () => {
    await oauth("google", "connect", "revoked@gmail.com");
    assert.match(await page("/calendars"), /access has expired or was revoked/);
    assert.match(await accountsHtml(), /Needs reconnecting/);
  }],
  ["sign in again keeps the same user", async () => {
    await oauth("google", "login", "me@gmail.com");
    assert.match(await accountsHtml(), /family@gmail\.com/);
  }],
  ["sign out revokes the session", async () => {
    // Firebase revocation has 1-second granularity: a session minted in the same
    // second as sign-out would still verify. Real users never sign out that fast.
    await new Promise((r) => setTimeout(r, 1100));
    const old = jar.get("__session");
    const r = await req("/api/auth/signout", { method: "POST", headers: { origin: BASE } });
    assert.equal(r.status, 303);
    assert.ok(!jar.has("__session"));
    jar.set("__session", old); // replay the old cookie
    assert.doesNotMatch(await accountsHtml(), /Signed in as/);
    jar.delete("__session");
  }],
];

let failed = 0;
for (const [name, fn] of steps) {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (e) {
    failed++;
    console.error(`✘ ${name}\n  ${e.message}`);
  }
}
console.log(failed ? `\n${failed} step(s) failed` : `\nAll ${steps.length} steps passed`);
process.exit(failed ? 1 : 0);
