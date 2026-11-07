import Link from "next/link";
import { Suspense } from "react";
import { Notice } from "@/components/Notice";
import { ProviderButton } from "@/components/ProviderButton";
import { getSessionUid } from "@/server/session";

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Calendar Sync</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Keep your calendars in sync from a single hub. Rules decide how much detail each calendar receives.
        </p>
      </div>
      <Suspense fallback={<div className="h-24" />}>
        <SignIn searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function SignIn({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const [uid, sp] = await Promise.all([getSessionUid(), searchParams]);
  if (uid) {
    return (
      <Link href="/accounts" className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
        Go to your accounts →
      </Link>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Notice error={sp.error} />
      <p className="text-sm text-zinc-500">Sign in with the account that holds your hub calendar.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <ProviderButton provider="google" mode="login" />
        <ProviderButton provider="microsoft" mode="login" />
      </div>
    </div>
  );
}
