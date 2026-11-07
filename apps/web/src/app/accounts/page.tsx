import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Notice } from "@/components/Notice";
import { ProviderButton } from "@/components/ProviderButton";
import { toSummary } from "@/server/accounts/types";
import { getDeps } from "@/server/deps";
import { PROVIDER_LABELS } from "@/server/oauth/providers";
import { getSessionUid } from "@/server/session";

export const metadata = { title: "Accounts · Calendar Sync" };

export default function AccountsPage({ searchParams }: PageProps<"/accounts">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <Accounts searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Accounts({ searchParams }: { searchParams: PageProps<"/accounts">["searchParams"] }) {
  const uid = await getSessionUid();
  if (!uid) redirect("/?error=not_signed_in");

  const deps = await getDeps();
  const [user, accounts, sp] = await Promise.all([deps.repo.getUser(uid), deps.repo.listAccounts(uid), searchParams]);
  if (!user) redirect("/?error=not_signed_in");

  const success = sp.connected ? "Account connected." : sp.disconnected ? "Account disconnected." : undefined;

  return (
    <>
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
          <p className="text-sm text-zinc-500">Signed in as {user.email}</p>
        </div>
        <form action="/api/auth/signout" method="post">
          <button className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900">Sign out</button>
        </form>
      </header>

      <Notice error={sp.error} success={success} />

      <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {accounts.map(toSummary).map((a) => {
          const isHub = a.id === user.hubAccountId;
          return (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{a.email}</p>
                <p className="text-xs text-zinc-500">
                  {PROVIDER_LABELS[a.provider]} · {a.status === "active" ? "Connected" : "Needs reconnecting"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isHub ? (
                  <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">Hub</span>
                ) : (
                  <form action={`/api/accounts/${encodeURIComponent(a.id)}/disconnect`} method="post">
                    <button className="rounded-md px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950">Disconnect</button>
                  </form>
                )}
                {a.status !== "active" && <ProviderButton provider={a.provider} mode={isHub ? "login" : "connect"}>Reconnect</ProviderButton>}
              </div>
            </li>
          );
        })}
      </ul>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Connect a spoke account</h2>
        <p className="text-sm text-zinc-500">You&apos;ll choose which of its calendars to sync in the next step (coming in Phase 2).</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <ProviderButton provider="google" mode="connect" />
          <ProviderButton provider="microsoft" mode="connect" />
        </div>
      </section>
    </>
  );
}
