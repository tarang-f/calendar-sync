import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppNav } from "@/components/AppNav";
import { Notice } from "@/components/Notice";
import { ProviderButton } from "@/components/ProviderButton";
import { badgeHub, badgeMuted, badgeSpoke, btn, btnDanger, btnPrimary, card, muted } from "@/components/ui";
import { getDeps } from "@/server/deps";
import { ERROR_MESSAGES } from "@/server/errors";
import { PROVIDER_LABELS } from "@/server/oauth/providers";
import { listAccountCalendars, type AccountCalendars } from "@/server/setup/service";
import { getSessionUid } from "@/server/session";

export const metadata = { title: "Calendars · Calendar Sync" };

export default function CalendarsPage({ searchParams }: PageProps<"/calendars">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6">
      <AppNav current="/calendars" />
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Calendars</h1>
        <p className={muted}>
          Pick one <strong>hub</strong> calendar from the account you sign in with. It receives every event in full. Then add
          the calendars to keep in sync as <strong>spokes</strong>.
        </p>
      </header>
      <Suspense fallback={<p className={muted}>Loading your calendars…</p>}>
        <Calendars searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Calendars({ searchParams }: { searchParams: PageProps<"/calendars">["searchParams"] }) {
  const uid = await getSessionUid();
  if (!uid) redirect("/?error=not_signed_in");
  const deps = await getDeps();
  const [accounts, sp] = await Promise.all([listAccountCalendars(deps, uid), searchParams]);
  const hasHub = accounts.some((a) => a.calendars.some((c) => c.selectedAs === "hub"));

  return (
    <>
      <Notice error={sp.error} ok={sp.ok} />
      {!hasHub && <p className="rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">Start by choosing your hub calendar below.</p>}
      {accounts.map((a) => (
        <AccountSection key={a.account.id} a={a} />
      ))}
    </>
  );
}

function AccountSection({ a }: { a: AccountCalendars }) {
  return (
    <section className={card} aria-labelledby={`acc-${a.account.id}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="min-w-0">
          <h2 id={`acc-${a.account.id}`} className="truncate font-medium">
            {a.account.email}
          </h2>
          <p className="text-xs text-zinc-500">
            {PROVIDER_LABELS[a.account.provider]}
            {a.isHubAccount ? " · Sign-in account" : ""}
          </p>
        </div>
      </header>

      {a.error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p className="text-sm text-red-700 dark:text-red-300">{ERROR_MESSAGES[a.error]}</p>
          {a.error === "needs_reauth" && (
            <ProviderButton provider={a.account.provider} mode={a.isHubAccount ? "login" : "connect"}>
              Reconnect
            </ProviderButton>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {a.calendars.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span aria-hidden className="h-3 w-3 shrink-0 rounded-full border border-black/10" style={{ background: c.color || "#a1a1aa" }} />
                <span className="truncate text-sm">{c.name}</span>
                {c.isPrimary && <span className={badgeMuted}>Primary</span>}
              </div>
              <div className="flex items-center gap-2">
                {c.selectedAs === "hub" && <span className={badgeHub}>Hub</span>}
                {c.selectedAs === "spoke" && (
                  <>
                    <span className={badgeSpoke}>Spoke</span>
                    <form action={`/api/calendars/${encodeURIComponent(c.id)}/remove`} method="post">
                      <button className={btnDanger}>Remove</button>
                    </form>
                  </>
                )}
                {!c.selectedAs && !c.canWrite && <span className={badgeMuted}>Read-only</span>}
                {!c.selectedAs && c.canWrite && (
                  <>
                    {a.isHubAccount && <CalendarAction action="/api/calendars/hub" accountId={a.account.id} calendarId={c.providerCalendarId} label="Make hub" primary />}
                    <CalendarAction action="/api/calendars/spokes" accountId={a.account.id} calendarId={c.providerCalendarId} label="Add as spoke" />
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CalendarAction(p: { action: string; accountId: string; calendarId: string; label: string; primary?: boolean }) {
  return (
    <form action={p.action} method="post">
      <input type="hidden" name="accountId" value={p.accountId} />
      <input type="hidden" name="providerCalendarId" value={p.calendarId} />
      <button className={p.primary ? btnPrimary : btn}>{p.label}</button>
    </form>
  );
}
