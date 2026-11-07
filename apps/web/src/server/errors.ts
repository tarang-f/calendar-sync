export type AppErrorCode =
  | "invalid_state"
  | "access_denied"
  | "missing_code"
  | "token_exchange_failed"
  | "no_refresh_token"
  | "missing_scopes"
  | "invalid_identity"
  | "not_signed_in"
  | "cannot_disconnect_hub"
  | "account_not_found"
  | "needs_reauth"
  | "provider_unavailable"
  | "calendar_not_found"
  | "calendar_read_only"
  | "hub_must_be_on_hub_account"
  | "hub_cannot_be_spoke"
  | "no_hub_calendar"
  | "rule_not_found"
  | "rule_in_use"
  | "rule_required"
  | "invalid_input"
  | "server_error";

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "AppError";
  }
}

/** User-facing text for each error code. */
export const ERROR_MESSAGES: Record<AppErrorCode, string> = {
  invalid_state: "That sign-in link expired or was opened in another tab. Please try again.",
  access_denied: "Access wasn't granted, so nothing was connected.",
  missing_code: "The provider didn't return an authorisation code. Please try again.",
  token_exchange_failed: "We couldn't complete sign-in with the provider. Please try again.",
  no_refresh_token: "The provider didn't grant offline access. Please try again and accept all permissions.",
  missing_scopes: "Calendar access wasn't granted. Please try again and tick every permission box.",
  invalid_identity: "We couldn't read your account details from the provider.",
  not_signed_in: "Please sign in first.",
  cannot_disconnect_hub: "Your hub account can't be disconnected.",
  account_not_found: "That account isn't connected.",
  needs_reauth: "That account's access has expired or was revoked. Please reconnect it.",
  provider_unavailable: "The calendar provider didn't respond. Please try again in a moment.",
  calendar_not_found: "That calendar no longer exists on the account.",
  calendar_read_only: "You only have read access to that calendar, so it can't receive synced events.",
  hub_must_be_on_hub_account: "The hub calendar must belong to the account you sign in with.",
  hub_cannot_be_spoke: "The hub calendar can't also be a spoke.",
  no_hub_calendar: "Choose your hub calendar first.",
  rule_not_found: "That rule no longer exists.",
  rule_in_use: "That rule is assigned to a calendar. Reassign those calendars before deleting it.",
  rule_required: "Pick a rule before turning sync on for this calendar.",
  invalid_input: "Please check the form and try again.",
  server_error: "Something went wrong on our side. Please try again.",
};

export function isAppErrorCode(x: unknown): x is AppErrorCode {
  return typeof x === "string" && x in ERROR_MESSAGES;
}
