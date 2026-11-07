import { handleForm } from "@/server/forms";
import { removeSpokeCalendar } from "@/server/setup/service";

/** POST → stop syncing this spoke calendar. */
export async function POST(req: Request, ctx: RouteContext<"/api/calendars/[calendarId]/remove">) {
  const { calendarId } = await ctx.params;
  return handleForm(req, "/calendars", "spoke_removed", (d, uid) => removeSpokeCalendar(d, uid, calendarId));
}
