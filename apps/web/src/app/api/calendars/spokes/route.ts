import { field, handleForm } from "@/server/forms";
import { addSpokeCalendar } from "@/server/setup/service";

/** POST accountId, providerCalendarId → add as a spoke. */
export function POST(req: Request) {
  return handleForm(req, "/calendars", "spoke_added", (d, uid, f) => addSpokeCalendar(d, uid, field(f, "accountId"), field(f, "providerCalendarId")));
}
