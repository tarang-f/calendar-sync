import type { FetchLike } from "../oauth/providers";
import { getJson } from "./http";
import type { ProviderCalendar } from "./types";

interface GraphCalendar {
  id: string;
  name?: string;
  canEdit?: boolean;
  isDefaultCalendar?: boolean;
  hexColor?: string;
}

/** Microsoft Graph: GET /me/calendars, following @odata.nextLink. */
export async function listMicrosoftCalendars(fetchImpl: FetchLike, apiBase: string, accessToken: string): Promise<ProviderCalendar[]> {
  const out: ProviderCalendar[] = [];
  let next: string | undefined = `${apiBase}/v1.0/me/calendars?$select=id,name,canEdit,isDefaultCalendar,hexColor&$top=100`;
  while (next) {
    const page = await getJson(fetchImpl, next, accessToken);
    for (const c of (page.value as GraphCalendar[] | undefined) ?? []) {
      out.push({
        providerCalendarId: c.id,
        name: c.name || "Calendar",
        canWrite: !!c.canEdit,
        isPrimary: !!c.isDefaultCalendar,
        color: c.hexColor || undefined,
      });
    }
    const link = page["@odata.nextLink"];
    // Only follow links back to the same API host.
    next = typeof link === "string" && link.startsWith(apiBase) ? link : undefined;
  }
  return out;
}
