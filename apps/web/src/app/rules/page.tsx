import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppNav } from "@/components/AppNav";
import { LevelSelect } from "@/components/LevelSelect";
import { Notice } from "@/components/Notice";
import { btn, btnDanger, btnPrimary, card, input, muted } from "@/components/ui";
import { getDeps } from "@/server/deps";
import { getSetupOverview } from "@/server/setup/service";
import { RULE_LEVEL_INFO, RULE_LEVELS } from "@/server/setup/types";
import { getSessionUid } from "@/server/session";

export const metadata = { title: "Rules · Calendar Sync" };

export default function RulesPage({ searchParams }: PageProps<"/rules">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6">
      <AppNav current="/rules" />
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Rules</h1>
        <p className={muted}>A rule sets how much detail a spoke calendar receives. One rule can be used by many calendars.</p>
      </header>

      <table className="w-full text-left text-sm">
        <caption className="sr-only">What each level shares</caption>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {RULE_LEVELS.map((l) => (
            <tr key={l}>
              <th scope="row" className="py-1.5 pr-4 font-medium whitespace-nowrap">{RULE_LEVEL_INFO[l].label}</th>
              <td className="py-1.5 text-zinc-600 dark:text-zinc-400">{RULE_LEVEL_INFO[l].description}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Suspense fallback={<p className={muted}>Loading rules…</p>}>
        <Rules searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Rules({ searchParams }: { searchParams: PageProps<"/rules">["searchParams"] }) {
  const uid = await getSessionUid();
  if (!uid) redirect("/?error=not_signed_in");
  const deps = await getDeps();
  const [{ rules, ruleUsage }, sp] = await Promise.all([getSetupOverview(deps, uid), searchParams]);

  return (
    <>
      <Notice error={sp.error} ok={sp.ok} />

      <form action="/api/rules" method="post" className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-end ${card}`}>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="new-name" className="text-sm font-medium">New rule name</label>
          <input id="new-name" name="name" required maxLength={60} placeholder="e.g. Work → Personal" className={input} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="new-level" className="text-sm font-medium">Level</label>
          <LevelSelect id="new-level" />
        </div>
        <button className={btnPrimary}>Create rule</button>
      </form>

      {rules.length === 0 ? (
        <p className={muted}>No rules yet. Create one above.</p>
      ) : (
        <ul className={`divide-y divide-zinc-200 dark:divide-zinc-800 ${card}`}>
          {rules.map((r) => {
            const used = ruleUsage[r.id] ?? 0;
            return (
              <li key={r.id} className="flex flex-col gap-2 px-4 py-3">
                <form action={`/api/rules/${r.id}/update`} method="post" className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label htmlFor={`name-${r.id}`} className="sr-only">Rule name</label>
                  <input id={`name-${r.id}`} name="name" required maxLength={60} defaultValue={r.name} className={`flex-1 ${input}`} />
                  <label htmlFor={`level-${r.id}`} className="sr-only">Level</label>
                  <LevelSelect id={`level-${r.id}`} defaultValue={r.level} />
                  <button className={btn}>Save</button>
                </form>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-zinc-500">{used === 0 ? "Not used by any calendar" : `Used by ${used} calendar${used === 1 ? "" : "s"}`}</p>
                  <form action={`/api/rules/${r.id}/delete`} method="post">
                    <button className={btnDanger} disabled={used > 0} title={used > 0 ? "Reassign its calendars first" : undefined}>Delete</button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
