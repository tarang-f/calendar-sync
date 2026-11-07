import { field, handleForm } from "@/server/forms";
import { createRule } from "@/server/setup/service";

/** POST name, level → create a rule. */
export function POST(req: Request) {
  return handleForm(req, "/rules", "rule_created", (d, uid, f) => createRule(d, uid, field(f, "name"), field(f, "level")));
}
