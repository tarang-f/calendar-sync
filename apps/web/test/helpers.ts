import { randomBytes } from "node:crypto";
import { expect } from "vitest";
import { AccessTokenService } from "@/server/accounts/accessTokens";
import { completeAuth, startAuth } from "@/server/auth/flow";
import { codeChallengeS256 } from "@/server/oauth/pkce";
import { decodeState } from "@/server/oauth/state";
import { MemoryAccountRepo } from "@/server/accounts/memoryRepo";
import { loadConfig } from "@/server/config";
import { LocalTokenCipher } from "@/server/crypto/tokenCipher";
import { issueMockCode, mockCaller, mockGoogleCalendarList, mockGraphCalendars, mockTokenResponse } from "@/server/oauth/mock";
import type { FetchLike, ProviderId } from "@/server/oauth/providers";
import { MemorySetupRepo } from "@/server/setup/memoryRepo";
import type { SetupDeps } from "@/server/setup/service";

export const testConfig = (over: Record<string, string> = {}) =>
  loadConfig({ APP_URL: "http://localhost:3000", OAUTH_MOCK: "1", NODE_ENV: "test", ...over });

/** fetch() that serves the mock provider in-process. `calls` records every URL. */
export function makeMockFetch() {
  const calls: string[] = [];
  const f: FetchLike = async (url, init) => {
    calls.push(url);
    const path = new URL(url).pathname;
    const auth = new Headers(init?.headers).get("authorization");
    if (path === "/api/auth/mock/token") {
      const [status, json] = mockTokenResponse(new URLSearchParams(String(init?.body)));
      return Response.json(json, { status });
    }
    if (path === "/api/mock/google/calendar/v3/users/me/calendarList") {
      const c = mockCaller(auth, "google");
      return c ? Response.json(mockGoogleCalendarList(c.e)) : new Response(null, { status: 401 });
    }
    if (path === "/api/mock/microsoft/v1.0/me/calendars") {
      const c = mockCaller(auth, "microsoft");
      return c ? Response.json(mockGraphCalendars(c.e)) : new Response(null, { status: 401 });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  return Object.assign(f, { calls });
}

export const mockFetch = makeMockFetch();

export type TestDeps = SetupDeps & { repo: MemoryAccountRepo; setup: MemorySetupRepo; fetch: ReturnType<typeof makeMockFetch> };

export function makeDeps(over: Partial<SetupDeps> = {}): TestDeps {
  const config = over.config ?? testConfig();
  const repo = new MemoryAccountRepo();
  const cipher = new LocalTokenCipher(randomBytes(32).toString("base64"));
  const fetch = makeMockFetch();
  let t = 1_700_000_000_000;
  const now = () => t;
  const deps = {
    config,
    repo,
    cipher,
    fetch,
    now,
    setup: new MemorySetupRepo(repo),
    tokens: new AccessTokenService({ config, repo, cipher, fetch, now }),
    ...over,
  } as TestDeps;
  return Object.assign(deps, { advance: (ms: number) => (t += ms) });
}

/** Runs start → (mock consent) → callback, like a browser would. */
export async function signIn(
  deps: TestDeps,
  provider: ProviderId,
  email: string,
  mode: "login" | "connect",
  sessionUid: string | null = null,
) {
  const { redirectUrl, stateCookie } = startAuth(deps, provider, mode);
  const auth = new URL(redirectUrl).searchParams;
  const st = decodeState(stateCookie, deps.now!())!;
  expect(auth.get("code_challenge")).toBe(codeChallengeS256(st.codeVerifier));
  const code = issueMockCode({
    provider,
    email,
    scope: auth.get("scope")!,
    codeChallenge: auth.get("code_challenge")!,
    redirectUri: auth.get("redirect_uri")!,
  });
  return completeAuth(deps, { provider, query: new URLSearchParams({ code, state: auth.get("state")! }), stateCookie, sessionUid });
}


/** Signs in a hub user and returns its uid and hub account id. */
export async function hubUser(deps: TestDeps, provider: ProviderId = "google", email = "me@gmail.com") {
  const r = await signIn(deps, provider, email, "login");
  if (!r.ok) throw new Error(`sign-in failed: ${r.error.code}`);
  return r;
}
