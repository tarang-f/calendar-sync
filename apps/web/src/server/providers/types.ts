/** A calendar as listed by a provider, normalised across Google and Microsoft. */
export interface ProviderCalendar {
  /** The provider's own id for the calendar. */
  providerCalendarId: string;
  name: string;
  /** True when the account can create events on it (needed for hub and spokes). */
  canWrite: boolean;
  isPrimary: boolean;
  color?: string;
}
