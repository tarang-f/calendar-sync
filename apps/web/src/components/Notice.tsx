import { ERROR_MESSAGES, isAppErrorCode } from "@/server/errors";

const OK_MESSAGES: Record<string, string> = {
  connected: "Account connected.",
  disconnected: "Account disconnected.",
  hub_set: "Hub calendar saved.",
  spoke_added: "Calendar added as a spoke. Assign it a rule on the Sync page.",
  spoke_removed: "Calendar removed. Copies already on it were left in place.",
  rule_created: "Rule created.",
  rule_saved: "Rule saved.",
  rule_deleted: "Rule deleted.",
  edge_saved: "Sync settings saved.",
};

type Param = string | string[] | undefined;
const first = (p: Param) => (Array.isArray(p) ? p[0] : p);

/** Shows ?error=… or ?ok=… from the query string. */
export function Notice({ error, ok }: { error?: Param; ok?: Param }) {
  const code = first(error);
  if (code) {
    const text = isAppErrorCode(code) ? ERROR_MESSAGES[code] : ERROR_MESSAGES.server_error;
    return (
      <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
        {text}
      </p>
    );
  }
  const okText = OK_MESSAGES[first(ok) ?? ""];
  if (okText) {
    return (
      <p role="status" className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
        {okText}
      </p>
    );
  }
  return null;
}
