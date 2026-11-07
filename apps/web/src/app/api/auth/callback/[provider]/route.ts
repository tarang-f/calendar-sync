import { connection, type NextRequest } from "next/server";
import { completeAuth } from "@/server/auth/flow";
import { getDeps } from "@/server/deps";
import { redirectTo } from "@/server/http";
import { isProviderId } from "@/server/oauth/providers";
import { STATE_COOKIE } from "@/server/oauth/state";
import { SESSION_COOKIE, SESSION_MAX_AGE_S, cookieOptions, createSessionCookie, getSessionUid } from "@/server/session";

/** GET /api/auth/callback/{google|microsoft} — the OAuth redirect URI. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/auth/callback/[provider]">) {
  await connection(); // never prerender
  const { provider } = await ctx.params;
  if (!isProviderId(provider)) return new Response("Unknown provider", { status: 404 });
  const deps = await getDeps();

  const result = await completeAuth(deps, {
    provider,
    query: req.nextUrl.searchParams,
    stateCookie: req.cookies.get(STATE_COOKIE)?.value,
    sessionUid: await getSessionUid(),
  });

  if (!result.ok) {
    console.warn(`auth callback failed (${provider}, ${result.mode}): ${result.error.code} ${result.error.message}`);
    const res = redirectTo(deps.config, result.mode === "connect" ? "/accounts" : "/", { error: result.error.code });
    res.cookies.delete(STATE_COOKIE);
    return res;
  }

  const res = redirectTo(deps.config, "/accounts", { connected: result.accountId });
  res.cookies.delete(STATE_COOKIE);
  if (result.mode === "login") {
    try {
      const session = await createSessionCookie(deps.config, result.uid);
      res.cookies.set(SESSION_COOKIE, session, cookieOptions(deps.config, SESSION_MAX_AGE_S));
    } catch (e) {
      console.error("session creation failed", e);
      return redirectTo(deps.config, "/", { error: "server_error" });
    }
  }
  return res;
}
