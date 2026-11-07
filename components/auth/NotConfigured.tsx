import Link from "next/link";
import { AuthShell } from "./AuthShell";

/** Shown on account pages when this deployment has no Supabase project. */
export function NotConfigured() {
  return (
    <AuthShell
      title="Accounts aren't set up"
      description={
        <>
          This copy of Gambit has no Supabase project configured, so accounts and online play are off. Set{" "}
          <code className="numeric text-ink">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="numeric text-ink">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> (see SUPABASE.md).
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        <Link href="/play/computer" className="rounded-lg bg-raised px-4 py-2 text-sm text-ink hover:bg-[#282724]">
          Play computer
        </Link>
        <Link href="/play/local" className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-raised hover:text-ink">
          Local 1v1
        </Link>
      </div>
    </AuthShell>
  );
}
