import type { AppConfig } from "../config";
import type { FetchLike, ProviderId } from "../oauth/providers";
import { listGoogleCalendars } from "./google";
import { listMicrosoftCalendars } from "./microsoft";
import type { ProviderCalendar } from "./types";

export type { ProviderCalendar } from "./types";

/** API base URLs; in mock mode they point at this app's fake provider endpoints. */
export function apiBase(cfg: AppConfig, provider: ProviderId): string {
  if (cfg.oauthMock) return `${cfg.appUrl}/api/mock/${provider}`;
  return provider === "google" ? "https://www.googleapis.com" : "https://graph.microsoft.com";
}

export async function listCalendars(
  cfg: AppConfig,
  provider: ProviderId,
  accessToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<ProviderCalendar[]> {
  const base = apiBase(cfg, provider);
  const cals =
    provider === "google"
      ? await listGoogleCalendars(fetchImpl, base, accessToken)
      : await listMicrosoftCalendars(fetchImpl, base, accessToken);
  // Primary first, then by name.
  return cals.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name));
}
