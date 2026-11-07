import "server-only";
import { getDeps } from "./deps";
import { AppError } from "./errors";
import { isSameOrigin, redirectTo } from "./http";
import type { SetupDeps } from "./setup/service";
import { getSessionUid } from "./session";

export type OkCode =
  | "hub_set"
  | "spoke_added"
  | "spoke_removed"
  | "rule_created"
  | "rule_saved"
  | "rule_deleted"
  | "edge_saved";

/**
 * Shared POST handler for HTML forms: checks origin and session, runs `fn`, then
 * redirects back to `path` with ?ok=… or ?error=… (Post/Redirect/Get).
 */
export async function handleForm(
  req: Request,
  path: string,
  ok: OkCode,
  fn: (d: SetupDeps, uid: string, form: FormData) => Promise<unknown>,
): Promise<Response> {
  const deps = await getDeps();
  if (!isSameOrigin(req, deps.config)) return new Response("Forbidden", { status: 403 });
  const uid = await getSessionUid();
  if (!uid) return redirectTo(deps.config, "/", { error: "not_signed_in" });
  try {
    await fn(deps, uid, await req.formData());
    return redirectTo(deps.config, path, { ok });
  } catch (e) {
    if (!(e instanceof AppError)) console.error(`form ${path} failed`, e);
    return redirectTo(deps.config, path, { error: e instanceof AppError ? e.code : "server_error" });
  }
}

export const field = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};
