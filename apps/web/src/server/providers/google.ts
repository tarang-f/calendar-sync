import type { FetchLike } from "../oauth/providers";
import { getJson } from "./http";
import type { ProviderCalendar } from "./types";

interface GoogleCalendarListEntry {
  id: string;
  summary?: string;
  summaryOverride?: string;
  primary?: boolean;
  accessRole?: "freeBusyReader" | "reader" | "writer" | "owner";
  backgroundColor?: string;
  deleted?: boolean;
  hidden?: boolean;
}

/** Google Calendar API: calendarList.list, all pages. */
export async function listGoogleCalendars(fetchImpl: FetchLike, apiBase: string, accessToken: string): Promise<ProviderCalendar[]> {
  const out: ProviderCalendar[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${apiBase}/calendar/v3/users/me/calendarList`);
    url.searchParams.set("maxResults", "250");
    url.searchParams.set("minAccessRole", "reader");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const page = await getJson(fetchImpl, url.toString(), accessToken);
    for (const c of (page.items as GoogleCalendarListEntry[] | undefined) ?? []) {
      if (c.deleted) continue;
      out.push({
        providerCalendarId: c.id,
        name: c.summaryOverride || c.summary || c.id,
        canWrite: c.accessRole === "owner" || c.accessRole === "writer",
        isPrimary: !!c.primary,
        color: c.backgroundColor,
      });
    }
    pageToken = typeof page.nextPageToken === "string" ? page.nextPageToken : undefined;
  } while (pageToken);
  return out;
}
