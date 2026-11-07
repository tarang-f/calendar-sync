import { field, handleForm } from "@/server/forms";
import { updateRule } from "@/server/setup/service";

/** POST name, level → update a rule. */
export async function POST(req: Request, ctx: RouteContext<"/api/rules/[ruleId]/update">) {
  const { ruleId } = await ctx.params;
  return handleForm(req, "/rules", "rule_saved", (d, uid, f) => updateRule(d, uid, ruleId, field(f, "name"), field(f, "level")));
}
