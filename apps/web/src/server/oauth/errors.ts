export type AuthErrorCode =
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
  | "server_error";

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "AuthError";
  }
}

/** User-facing text for each error code. */
export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
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
  server_error: "Something went wrong on our side. Please try again.",
};

export function isAuthErrorCode(x: unknown): x is AuthErrorCode {
  return typeof x === "string" && x in AUTH_ERROR_MESSAGES;
}
