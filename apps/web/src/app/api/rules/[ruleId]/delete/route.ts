import { handleForm } from "@/server/forms";
import { deleteRule } from "@/server/setup/service";

/** POST → delete a rule that no calendar uses. */
export async function POST(req: Request, ctx: RouteContext<"/api/rules/[ruleId]/delete">) {
  const { ruleId } = await ctx.params;
  return handleForm(req, "/rules", "rule_deleted", (d, uid) => deleteRule(d, uid, ruleId));
}
