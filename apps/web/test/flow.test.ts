import { describe, expect, it } from "vitest";
import { completeAuth, disconnectAccount, startAuth, tokenAad } from "@/server/auth/flow";
import { issueMockCode } from "@/server/oauth/mock";
import { makeDeps, signIn } from "./helpers";

describe("auth flow", () => {
  it("first login creates a user whose hub is the login account", async () => {
    const deps = makeDeps();
    const r = await signIn(deps, "google", "me@gmail.com", "login");
    expect(r).toMatchObject({ ok: true, mode: "login", created: true });
    if (!r.ok) return;
    const user = await deps.repo.getUser(r.uid);
    expect(user?.hubAccountId).toBe(r.accountId);
    const acct = await deps.repo.getAccount(r.uid, r.accountId);
    expect(acct?.email).toBe("me@gmail.com");
    expect(acct?.encRefreshToken).not.toContain("mock-refresh");
    expect(await deps.cipher.decrypt(acct!.encRefreshToken, tokenAad(r.uid, r.accountId))).toMatch(/^mock-refresh\./);
  });

  it("second login returns the same user", async () => {
    const deps = makeDeps();
    const a = await signIn(deps, "google", "me@gmail.com", "login");
    const b = await signIn(deps, "google", "me@gmail.com", "login");
    expect(a.ok && b.ok && a.uid === b.uid && !b.created).toBe(true);
  });

  it("connect adds a spoke account to the signed-in user", async () => {
    const deps = makeDeps();
    const hub = await signIn(deps, "google", "me@gmail.com", "login");
    if (!hub.ok) throw new Error("login failed");
    const spoke = await signIn(deps, "microsoft", "me@work.com", "connect", hub.uid);
    expect(spoke).toMatchObject({ ok: true, mode: "connect", uid: hub.uid });
    expect((await deps.repo.listAccounts(hub.uid)).map((a) => a.provider)).toEqual(["google", "microsoft"]);
    expect(deps.repo.logins.size).toBe(1); // spokes are not login identities
  });

  it("connect without a session fails", async () => {
    const r = await signIn(makeDeps(), "microsoft", "me@work.com", "connect", null);
    expect(r).toMatchObject({ ok: false, error: { code: "not_signed_in" } });
  });

  it("rejects a mismatched state", async () => {
    const deps = makeDeps();
    const { stateCookie } = startAuth(deps, "google", "login");
    const r = await completeAuth(deps, { provider: "google", query: new URLSearchParams({ code: "x", state: "forged" }), stateCookie, sessionUid: null });
    expect(r).toMatchObject({ ok: false, error: { code: "invalid_state" } });
  });

  it("rejects a callback for a different provider", async () => {
    const deps = makeDeps();
    const { redirectUrl, stateCookie } = startAuth(deps, "google", "login");
    const state = new URL(redirectUrl).searchParams.get("state")!;
    const r = await completeAuth(deps, { provider: "microsoft", query: new URLSearchParams({ code: "x", state }), stateCookie, sessionUid: null });
    expect(r).toMatchObject({ ok: false, error: { code: "invalid_state" } });
  });

  it("maps a denied consent to access_denied", async () => {
    const deps = makeDeps();
    const { redirectUrl, stateCookie } = startAuth(deps, "google", "login");
    const state = new URL(redirectUrl).searchParams.get("state")!;
    const r = await completeAuth(deps, { provider: "google", query: new URLSearchParams({ error: "access_denied", state }), stateCookie, sessionUid: null });
    expect(r).toMatchObject({ ok: false, error: { code: "access_denied" } });
  });

  it("fails PKCE when the verifier doesn't match", async () => {
    const deps = makeDeps();
    const { redirectUrl, stateCookie } = startAuth(deps, "google", "login");
    const auth = new URL(redirectUrl).searchParams;
    const code = issueMockCode({ provider: "google", email: "a@b.c", scope: auth.get("scope")!, codeChallenge: "wrong", redirectUri: auth.get("redirect_uri")! });
    const r = await completeAuth(deps, { provider: "google", query: new URLSearchParams({ code, state: auth.get("state")! }), stateCookie, sessionUid: null });
    expect(r).toMatchObject({ ok: false, error: { code: "token_exchange_failed" } });
  });

  it("disconnects spokes but never the hub", async () => {
    const deps = makeDeps();
    const hub = await signIn(deps, "google", "me@gmail.com", "login");
    if (!hub.ok) throw new Error();
    const spoke = await signIn(deps, "microsoft", "me@work.com", "connect", hub.uid);
    if (!spoke.ok) throw new Error();
    await expect(disconnectAccount(deps, hub.uid, hub.accountId)).rejects.toMatchObject({ code: "cannot_disconnect_hub" });
    await disconnectAccount(deps, hub.uid, spoke.accountId);
    expect((await deps.repo.listAccounts(hub.uid)).map((a) => a.id)).toEqual([hub.accountId]);
    await expect(disconnectAccount(deps, hub.uid, spoke.accountId)).rejects.toMatchObject({ code: "account_not_found" });
    await expect(disconnectAccount(deps, hub.uid, "../x/y")).rejects.toMatchObject({ code: "account_not_found" });
  });
});
