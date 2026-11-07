import { getDeps } from "@/server/deps";
import { adminAuth } from "@/server/firebaseAdmin";
import { isSameOrigin, redirectTo } from "@/server/http";
import { SESSION_COOKIE, getSessionUid } from "@/server/session";

/** POST /api/auth/signout — ends the session everywhere. */
export async function POST(req: Request) {
  const deps = await getDeps();
  if (!isSameOrigin(req, deps.config)) return new Response("Forbidden", { status: 403 });
  const uid = await getSessionUid();
  if (uid) await adminAuth().revokeRefreshTokens(uid).catch(() => undefined);
  const res = redirectTo(deps.config, "/");
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
