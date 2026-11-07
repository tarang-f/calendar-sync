import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppNav } from "@/components/AppNav";
import { Notice } from "@/components/Notice";
import { badgeHub, btn, card, input, muted } from "@/components/ui";
import { getDeps } from "@/server/deps";
import { PROVIDER_LABELS } from "@/server/oauth/providers";
import { getSetupOverview } from "@/server/setup/service";
import { RULE_LEVEL_INFO } from "@/server/setup/types";
import { getSessionUid } from "@/server/session";

export const metadata = { title: "Sync · Calendar Sync" };

export default function SyncPage({ searchParams }: PageProps<"/sync">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6">
      <AppNav current="/sync" />
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Sync</h1>
        <p className={muted}>Give each spoke calendar a rule, then turn sync on.</p>
      </header>
      <Suspense fallback={<p className={muted}>Loading…</p>}>
        <Sync searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Sync({ searchParams }: { searchParams: PageProps<"/sync">["searchParams"] }) {
  const uid = await getSessionUid();
  if (!uid) redirect("/?error=not_signed_in");
  const deps = await getDeps();
  const [o, sp] = await Promise.all([getSetupOverview(deps, uid), searchParams]);

  return (
    <>
      <Notice error={sp.error} ok={sp.ok} />

      <section className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${card}`}>
        {o.hub ? (
          <div className="min-w-0">
            <p className="truncate font-medium">{o.hub.calendar.name}</p>
            <p className="text-xs text-zinc-500">
              {o.hub.account ? `${PROVIDER_LABELS[o.hub.account.provider]} · ${o.hub.account.email}` : ""} · receives everything in full
            </p>
          </div>
        ) : (
          <p className="text-sm">
            No hub calendar yet.{" "}
            <Link href="/calendars" className="font-medium underline underline-offset-2">Choose one →</Link>
          </p>
        )}
        <span className={badgeHub}>Hub</span>
      </section>

      {o.rules.length === 0 && (
        <p className="text-sm">
          You need at least one rule.{" "}
          <Link href="/rules" className="font-medium underline underline-offset-2">Create a rule →</Link>
        </p>
      )}

      {o.spokes.length === 0 ? (
        <p className={muted}>
          No spoke calendars yet.{" "}
          <Link href="/calendars" className="underline underline-offset-2">Add some on the Calendars page.</Link>
        </p>
      ) : (
        <ul className={`divide-y divide-zinc-200 dark:divide-zinc-800 ${card}`}>
          {o.spokes.map((s) => (
            <li key={s.calendar.id} className="px-4 py-3">
              <form action={`/api/edges/${encodeURIComponent(s.calendar.id)}`} method="post" className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-medium">{s.calendar.name}</p>
                  <p className="truncate text-xs text-zinc-500">
                    {s.account ? `${PROVIDER_LABELS[s.account.provider]} · ${s.account.email}` : "Account removed"}
                    {s.rule ? ` · ${RULE_LEVEL_INFO[s.rule.level].label}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label htmlFor={`rule-${s.calendar.id}`} className="sr-only">Rule for {s.calendar.name}</label>
                  <select id={`rule-${s.calendar.id}`} name="ruleId" defaultValue={s.edge?.ruleId ?? ""} className={input}>
                    <option value="">Choose a rule…</option>
                    {o.rules.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" name="enabled" defaultChecked={s.edge?.enabled} className="h-4 w-4" />
                    Sync on
                  </label>
                  <button className={btn}>Save</button>
                </div>
              </form>
            </li>
          ))}
        </ul>
      )}
      <p className={muted}>Syncing itself starts in a later phase. For now this saves what will sync where.</p>
    </>
  );
}
