import Link from "next/link";

const LINKS = [
  { href: "/accounts", label: "Accounts" },
  { href: "/calendars", label: "Calendars" },
  { href: "/rules", label: "Rules" },
  { href: "/sync", label: "Sync" },
] as const;

/** Top navigation for signed-in pages. Static: no session read, so it prerenders. */
export function AppNav({ current }: { current: (typeof LINKS)[number]["href"] }) {
  return (
    <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
      <span className="order-1 font-semibold">Calendar Sync</span>
      <div className="order-3 -ml-2.5 flex w-full flex-wrap gap-1 sm:order-2 sm:ml-0 sm:w-auto">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={l.href === current ? "page" : undefined}
            className="rounded-md px-2.5 py-1 text-sm text-zinc-600 hover:bg-zinc-100 aria-[current=page]:bg-zinc-100 aria-[current=page]:font-medium aria-[current=page]:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:aria-[current=page]:bg-zinc-900 dark:aria-[current=page]:text-zinc-100"
          >
            {l.label}
          </Link>
        ))}
      </div>
      <form action="/api/auth/signout" method="post" className="order-2 ml-auto sm:order-3">
        <button className="rounded-md px-2.5 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900">Sign out</button>
      </form>
    </nav>
  );
}
