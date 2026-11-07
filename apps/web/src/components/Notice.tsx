import { AUTH_ERROR_MESSAGES, isAuthErrorCode } from "@/server/oauth/errors";

/** Shows ?error=… or a success message from the query string. */
export function Notice({ error, success }: { error?: string | string[]; success?: string }) {
  const code = Array.isArray(error) ? error[0] : error;
  if (code) {
    const text = isAuthErrorCode(code) ? AUTH_ERROR_MESSAGES[code] : AUTH_ERROR_MESSAGES.server_error;
    return (
      <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
        {text}
      </p>
    );
  }
  if (success) {
    return (
      <p role="status" className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
        {success}
      </p>
    );
  }
  return null;
}
