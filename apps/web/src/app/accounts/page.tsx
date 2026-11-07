import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppNav } from "@/components/AppNav";
import { Notice } from "@/components/Notice";
import { ProviderButton } from "@/components/ProviderButton";
import { badgeHub, btnDanger, card, muted } from "@/components/ui";
import { toSummary } from "@/server/accounts/types";
import { getDeps } from "@/server/deps";
import { PROVIDER_LABELS } from "@/server/oauth/providers";
import { getSessionUid } from "@/server/session";

export const metadata = { title: "Accounts · Calendar Sync" };

export default function AccountsPage({ searchParams }: PageProps<"/accounts">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6">
      <AppNav current="/accounts" />
      <Suspense fallback={<p className={muted}>Loading…</p>}>
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

  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <p className={muted}>Signed in as {user.email}</p>
      </header>

      <Notice error={sp.error} ok={sp.ok} />

      {!user.hubCalendarId && (
        <p className="rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
          Next step:{" "}
          <Link href="/calendars" className="font-medium underline underline-offset-2">
            choose your hub calendar →
          </Link>
        </p>
      )}

      <ul className={`divide-y divide-zinc-200 dark:divide-zinc-800 ${card}`}>
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
                {a.status !== "active" && (
                  <ProviderButton provider={a.provider} mode={isHub ? "login" : "connect"}>
                    Reconnect
                  </ProviderButton>
                )}
                {isHub ? (
                  <span className={badgeHub}>Hub</span>
                ) : (
                  <form action={`/api/accounts/${encodeURIComponent(a.id)}/disconnect`} method="post">
                    <button className={btnDanger}>Disconnect</button>
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Connect a spoke account</h2>
        <p className={muted}>
          After connecting, pick which of its calendars to sync on the{" "}
          <Link href="/calendars" className="underline underline-offset-2">
            Calendars
          </Link>{" "}
          page.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <ProviderButton provider="google" mode="connect" />
          <ProviderButton provider="microsoft" mode="connect" />
        </div>
      </section>
    </>
  );
}
