import type { ProviderId } from "@/server/oauth/providers";
import { PROVIDER_LABELS } from "@/server/oauth/providers";

/** Plain link to the OAuth start route (full-page navigation, no client JS). */
export function ProviderButton({ provider, mode, children }: { provider: ProviderId; mode: "login" | "connect"; children?: React.ReactNode }) {
  return (
    <a
      href={`/api/auth/start/${provider}?mode=${mode}`}
      className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
    >
      {children ?? `${mode === "login" ? "Sign in" : "Connect"} with ${PROVIDER_LABELS[provider]}`}
    </a>
  );
}
