"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePlayer } from "@/hooks/usePlayer";
import { useUsernameCheck } from "@/hooks/useUsernameCheck";
import { loginHref } from "@/lib/auth/validation";
import { errorMessage, type Profile } from "@/lib/multiplayer/types";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/auth/AuthShell";
import { UsernameHint } from "@/components/auth/UsernameHint";

interface OnlineGateProps {
  children: (profile: Profile) => React.ReactNode;
  /** In-game: no player bar or resume banner, just the content. */
  bare?: boolean;
}

const linkClass = "rounded-lg px-4 py-2 text-sm text-muted hover:bg-raised hover:text-ink";
const primaryLinkClass =
  "inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-[#231a0c] hover:bg-[#dcb673]";

/**
 * Online screens need a signed-in account with a username. Signed-out visitors
 * go to log in and come back here afterwards. Offline modes never render this.
 */
export function OnlineGate({ children, bare = false }: OnlineGateProps) {
  const { state, retry, setUsername } = usePlayer({ revalidate: true });
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (state.status === "signed-out") router.replace(loginHref(`${pathname}${window.location.search}`));
  }, [pathname, router, state.status]);

  if (state.status === "unconfigured") {
    return (
      <Notice title="Online play isn't set up yet">
        This copy of Gambit has no Supabase project configured. Offline modes still work —
        see <code className="numeric text-ink">SUPABASE.md</code> to enable online play.
        <div className="mt-5 flex justify-center gap-2">
          <Link href="/play/computer" className="rounded-lg bg-raised px-4 py-2 text-sm text-ink hover:bg-[#26262b]">
            Play computer
          </Link>
          <Link href="/play/local" className={linkClass}>
            Local 1v1
          </Link>
        </div>
      </Notice>
    );
  }
  if (state.status === "loading" || state.status === "signed-out") {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-sm text-muted" role="status">
        <span aria-hidden className="size-5 animate-spin rounded-full border-2 border-line border-t-accent" />
        {state.status === "signed-out" ? "Taking you to log in…" : "Connecting…"}
      </div>
    );
  }
  if (state.status === "anonymous") {
    return (
      <Notice title="Create an account to play online">
        Online games now use Gambit accounts. Sign up to turn this guest session into an account — your games
        stay with you — or log in to an existing one.
        <div className="mt-5 flex justify-center gap-2">
          <Link href={`/signup?next=${encodeURIComponent(pathname)}`} className={primaryLinkClass}>
            Create account
          </Link>
          <Link href={loginHref(pathname)} className={linkClass}>
            Log in
          </Link>
        </div>
      </Notice>
    );
  }
  if (state.status === "error") {
    const signedOut = state.error === "signed_out" || state.error === "unauthorized";
    return (
      <Notice title="Couldn't connect">
        {errorMessage(state.error)}
        <div className="mt-5">
          {signedOut ? (
            <Link href={loginHref(pathname)} className={primaryLinkClass}>
              Log in again
            </Link>
          ) : (
            <Button onClick={retry}>Try again</Button>
          )}
        </div>
      </Notice>
    );
  }

  const { profile } = state;
  if (!profile.username) return <ChooseUsername onSave={setUsername} />;
  if (bare) return <>{children(profile)}</>;
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <span className="eyebrow">Playing as</span>
        <span className="font-semibold">{profile.username}</span>
        <Link href="/profile" className="rounded px-1.5 text-xs text-muted underline-offset-2 hover:text-ink hover:underline">
          Profile
        </Link>
      </div>
      {profile.activeGameId && <ResumeBanner gameId={profile.activeGameId} />}
      {children(profile)}
    </>
  );
}

export function ResumeBanner({ gameId }: { gameId: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/50 bg-accent-soft/50 px-4 py-3">
      <p className="text-sm">You have a game in progress. Finish it before starting another.</p>
      <Link
        href={`/game/${gameId}`}
        className="rounded-md bg-accent px-3 py-1.5 text-[0.8125rem] font-semibold text-[#231a0c] hover:bg-[#dcb673]"
      >
        Resume game
      </Link>
    </div>
  );
}

/** For accounts that predate usernames, or whose sign-up name couldn't be saved. */
function ChooseUsername({ onSave }: { onSave: (name: string) => Promise<string | null> }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const check = useUsernameCheck(name);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(await onSave(name));
    setSaving(false);
  };

  return (
    <form onSubmit={save} noValidate className="mx-auto max-w-sm space-y-4 py-8">
      <div>
        <h2 className="text-lg font-semibold">Choose your username</h2>
        <p className="mt-1 text-sm text-muted">Other players see it in games and rooms. You can change it later.</p>
      </div>
      <Field
        label="Username"
        value={name}
        onChange={(value) => setName(value.replace(/\s/g, ""))}
        maxLength={20}
        autoCapitalize="none"
        autoComplete="username"
        error={error}
        hint={<UsernameHint check={check} />}
        autoFocus
      />
      <Button type="submit" variant="primary" block disabled={saving} aria-busy={saving}>
        {saving ? "Saving…" : "Save username"}
      </Button>
    </form>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-muted">{children}</div>
    </div>
  );
}
