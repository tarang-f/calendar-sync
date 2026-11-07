import { field, handleForm } from "@/server/forms";
import { updateEdge } from "@/server/setup/service";

/** POST ruleId, enabled → assign a rule to a spoke and turn sync on/off. */
export async function POST(req: Request, ctx: RouteContext<"/api/edges/[edgeId]">) {
  const { edgeId } = await ctx.params;
  return handleForm(req, "/sync", "edge_saved", (d, uid, f) =>
    updateEdge(d, uid, edgeId, field(f, "ruleId") || null, field(f, "enabled") === "on"),
  );
}
