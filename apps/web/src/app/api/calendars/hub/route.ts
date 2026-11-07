import { field, handleForm } from "@/server/forms";
import { setHubCalendar } from "@/server/setup/service";

/** POST accountId, providerCalendarId → make it the hub calendar. */
export function POST(req: Request) {
  return handleForm(req, "/calendars", "hub_set", (d, uid, f) => setHubCalendar(d, uid, field(f, "accountId"), field(f, "providerCalendarId")));
}
