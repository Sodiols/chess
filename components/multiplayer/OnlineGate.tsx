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

const linkClass =
  "press inline-flex h-11 items-center rounded-md px-5 text-sm font-semibold text-muted hover:bg-raised hover:text-ink";
const primaryLinkClass =
  "press inline-flex h-11 items-center rounded-md bg-accent px-5 text-sm font-bold text-[#1f170a] hover:bg-[#e2b970]";

/**
 * Online screens need a signed-in account with a username. Signed-out visitors
 * go to log in and come back here afterwards. Offline modes never render this.
 */
export function OnlineGate({ children, bare = false }: OnlineGateProps) {
  const { state, retry, setUsername } = usePlayer({ revalidate: true });
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (state.status === "signed-out")
      router.replace(loginHref(`${pathname}${window.location.search}`));
  }, [pathname, router, state.status]);

  if (state.status === "unconfigured") {
    return (
      <Notice title="Online play isn't set up yet">
        This copy of Gambit has no Supabase project configured. Offline modes
        still work — see <code className="numeric text-ink">SUPABASE.md</code>{" "}
        to enable online play.
        <div className="mt-5 flex justify-center gap-2">
          <Link
            href="/play/computer"
            className="press inline-flex h-11 items-center rounded-md bg-raised px-5 text-sm font-semibold text-ink hover:bg-[#282724]"
          >
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
      <div
        className="flex items-center justify-center gap-3 py-24 text-sm text-muted"
        role="status"
      >
        <span
          aria-hidden
          className="size-5 animate-spin rounded-full border-2 border-line border-t-accent"
        />
        {state.status === "signed-out"
          ? "Taking you to log in…"
          : "Connecting…"}
      </div>
    );
  }
  if (state.status === "anonymous") {
    return (
      <Notice title="Create an account to play online">
        Online games now use Gambit accounts. Sign up to turn this guest session
        into an account — your games stay with you — or log in to an existing
        one.
        <div className="mt-5 flex justify-center gap-2">
          <Link
            href={`/signup?next=${encodeURIComponent(pathname)}`}
            className={primaryLinkClass}
          >
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
    const signedOut =
      state.error === "signed_out" || state.error === "unauthorized";
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
      <div
        className="mb-8 flex animate-enter flex-wrap items-center gap-3 text-[0.9375rem]"
        style={{ animationDelay: "100ms" }}
      >
        <span
          aria-hidden
          className="flex size-9 items-center justify-center rounded-full bg-accent text-base font-extrabold text-[#1f170a] uppercase"
        >
          {profile.username.slice(0, 1)}
        </span>
        <span className="text-muted">
          Playing as{" "}
          <span className="font-bold text-ink">{profile.username}</span>
        </span>
        <Link
          href="/profile"
          className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline inline-block py-2.5 -my-2.5"
        >
          Your profile
        </Link>
      </div>
      {profile.activeGameId && <ResumeBanner gameId={profile.activeGameId} />}
      {children(profile)}
    </>
  );
}

export function ResumeBanner({ gameId }: { gameId: string }) {
  return (
    <div className="mb-8 flex animate-rise flex-wrap items-center justify-between gap-3 rounded-lg bg-accent-soft px-5 py-4">
      <p className="text-[0.9375rem]">
        <span className="font-bold">You have a game in progress.</span> Finish
        it before starting another.
      </p>
      <Link
        href={`/game/${gameId}`}
        className="press inline-flex h-10 items-center rounded-md bg-accent px-4 text-sm font-bold text-[#1f170a] hover:bg-[#e2b970]"
      >
        Resume game
      </Link>
    </div>
  );
}

/** For accounts that predate usernames, or whose sign-up name couldn't be saved. */
function ChooseUsername({
  onSave,
}: {
  onSave: (name: string) => Promise<string | null>;
}) {
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
    <form
      onSubmit={save}
      noValidate
      className="max-w-md animate-rise space-y-5 py-4"
    >
      <div>
        <h2 className="text-2xl font-extrabold">Choose your username</h2>
        <p className="mt-2 text-[0.9375rem] text-muted">
          Other players see it in games and rooms. You can change it later.
        </p>
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
      <Button
        type="submit"
        variant="primary"
        block
        disabled={saving}
        aria-busy={saving}
      >
        {saving ? "Saving…" : "Save username"}
      </Button>
    </form>
  );
}

function Notice({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-xl animate-rise rounded-lg bg-surface px-6 py-10 sm:px-10">
      <h2 className="text-2xl font-extrabold">{title}</h2>
      <div className="mt-3 text-[0.9375rem] leading-relaxed text-muted [&>div]:justify-start">
        {children}
      </div>
    </div>
  );
}
