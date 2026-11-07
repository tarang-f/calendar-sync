import { disconnectAccount } from "@/server/auth/flow";
import { getDeps } from "@/server/deps";
import { isSameOrigin, redirectTo } from "@/server/http";
import { AppError } from "@/server/errors";
import { getSessionUid } from "@/server/session";

/** POST /api/accounts/{accountId}/disconnect — removes a spoke account. */
export async function POST(req: Request, ctx: RouteContext<"/api/accounts/[accountId]/disconnect">) {
  const deps = await getDeps();
  if (!isSameOrigin(req, deps.config)) return new Response("Forbidden", { status: 403 });
  const uid = await getSessionUid();
  if (!uid) return redirectTo(deps.config, "/", { error: "not_signed_in" });

  const { accountId } = await ctx.params;
  try {
    await disconnectAccount(deps, uid, accountId);
    return redirectTo(deps.config, "/accounts", { ok: "disconnected" });
  } catch (e) {
    const code = e instanceof AppError ? e.code : "server_error";
    return redirectTo(deps.config, "/accounts", { error: code });
  }
}
