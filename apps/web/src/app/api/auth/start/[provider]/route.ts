import { connection, NextResponse, type NextRequest } from "next/server";
import { startAuth } from "@/server/auth/flow";
import { getDeps } from "@/server/deps";
import { redirectTo } from "@/server/http";
import { isProviderId } from "@/server/oauth/providers";
import { STATE_COOKIE, STATE_TTL_MS } from "@/server/oauth/state";
import { cookieOptions, getSessionUid } from "@/server/session";

/** GET /api/auth/start/{google|microsoft}?mode=login|connect → provider consent screen. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/auth/start/[provider]">) {
  await connection(); // never prerender
  const { provider } = await ctx.params;
  if (!isProviderId(provider)) return new Response("Unknown provider", { status: 404 });
  const deps = await getDeps();

  const mode = req.nextUrl.searchParams.get("mode") === "connect" ? "connect" : "login";
  if (mode === "connect" && !(await getSessionUid())) return redirectTo(deps.config, "/", { error: "not_signed_in" });

  const { redirectUrl, stateCookie } = startAuth(deps, provider, mode);
  const res = NextResponse.redirect(redirectUrl, 302);
  res.cookies.set(STATE_COOKIE, stateCookie, cookieOptions(deps.config, STATE_TTL_MS / 1000));
  return res;
}
