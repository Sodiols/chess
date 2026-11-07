"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/Button";
import { Field, FormAlert, Spinner } from "@/components/auth/AuthShell";
import { UsernameHint } from "@/components/auth/UsernameHint";
import { usePlayer } from "@/hooks/usePlayer";
import { useUsernameCheck } from "@/hooks/useUsernameCheck";
import { getBrowserClient } from "@/lib/supabase/browser";
import { signOut } from "@/lib/auth/session";
import { authErrorCode } from "@/lib/auth/errors";
import { loginHref, validatePassword } from "@/lib/auth/validation";
import { api } from "@/lib/multiplayer/client";
import {
  errorMessage,
  type PlayerStats,
  type RecentGame,
} from "@/lib/multiplayer/types";
import { formatTimeControl } from "@/lib/chess/format";

const DATE = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "long",
  day: "numeric",
});
const SHORT_DATE = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

export function ProfileView() {
  const router = useRouter();
  const { state, auth, retry, setUsername } = usePlayer({ revalidate: true });

  useEffect(() => {
    if (auth.status === "signed-out" || auth.status === "anonymous")
      router.replace(loginHref("/profile"));
  }, [auth.status, router]);

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-[72rem] px-4 pt-10 pb-24 sm:px-6 sm:pt-14 lg:px-8">
        {auth.status === "unconfigured" ? (
          <p className="py-16 text-center text-sm text-muted">
            Accounts aren&rsquo;t configured on this server.
          </p>
        ) : state.status === "error" ? (
          <div className="py-16 text-center">
            <FormAlert error={state.error} />
            <Button className="mt-4" onClick={retry}>
              Try again
            </Button>
          </div>
        ) : state.status !== "ready" || auth.status !== "signed-in" ? (
          <Spinner label="Loading your profile…" />
        ) : (
          <>
            <header className="flex animate-enter flex-wrap items-center justify-between gap-6">
              <div className="flex min-w-0 items-center gap-5">
                <span
                  aria-hidden
                  className="flex size-16 shrink-0 items-center justify-center rounded-full bg-accent text-[1.75rem] font-extrabold text-[#1f170a] uppercase sm:size-20 sm:text-[2.25rem]"
                >
                  {(state.profile.username ?? "?").slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <h1 className="truncate text-[2.25rem] leading-[1.05] font-extrabold sm:text-[3rem]">
                    {state.profile.username ?? "New player"}
                  </h1>
                  <p className="mt-1.5 text-[0.9375rem] text-muted">
                    Member since{" "}
                    {DATE.format(
                      new Date(auth.user.created_at ?? state.profile.createdAt),
                    )}
                  </p>
                </div>
              </div>
              <Link
                href="/play"
                className="press inline-flex h-12 items-center rounded-md bg-accent px-6 text-[0.9375rem] font-bold text-[#1f170a] hover:bg-[#e2b970]"
              >
                Play a game
              </Link>
            </header>
            <Stats />
            <section
              id="settings"
              aria-labelledby="settings-heading"
              className="reveal mt-24 scroll-mt-20"
            >
              <h2
                id="settings-heading"
                className="text-[2rem] leading-tight font-extrabold"
              >
                Account settings
              </h2>
              <div className="mt-6 grid items-start gap-4 md:grid-cols-2">
                <div className="rounded-lg bg-surface p-6 sm:p-7">
                  <dl className="text-[0.9375rem]">
                    <div>
                      <dt className="text-sm font-semibold">Email</dt>
                      <dd className="mt-1 break-all text-muted">
                        {auth.user.email}
                      </dd>
                    </div>
                  </dl>
                  <UsernameForm
                    current={state.profile.username}
                    onSave={setUsername}
                  />
                </div>
                <div className="rounded-lg bg-surface p-6 sm:p-7">
                  <PasswordForm />
                  <div className="mt-8">
                    <Button
                      variant="danger"
                      onClick={() =>
                        void signOut().then(() => router.push("/"))
                      }
                    >
                      Log out
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function Stats() {
  const [data, setData] = useState<{
    stats: PlayerStats;
    recent: RecentGame[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void api<{ stats: PlayerStats; recent: RecentGame[] }>(
      "/api/profile/stats",
    ).then((result) => {
      if (cancelled) return;
      if (result.ok) setData({ stats: result.stats, recent: result.recent });
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (error) {
    return (
      <section className="mt-8">
        <FormAlert error={error} />
        <Button
          size="sm"
          className="mt-3"
          onClick={() => {
            setError(null);
            setAttempt((value) => value + 1);
          }}
        >
          Try again
        </Button>
      </section>
    );
  }
  if (!data) return <Spinner label="Loading results…" />;

  const { stats, recent } = data;
  const winRate = stats.played
    ? `${Math.round((stats.wins / stats.played) * 100)}%`
    : "—";
  // One bar split by result; each part is its true share of games played.
  const parts = [
    { label: "Wins", value: stats.wins, className: "bg-positive" },
    { label: "Draws", value: stats.draws, className: "bg-faint" },
    { label: "Losses", value: stats.losses, className: "bg-danger" },
  ];

  return (
    <>
      <section
        aria-labelledby="stats-heading"
        className="mt-14 animate-enter"
        style={{ animationDelay: "80ms" }}
      >
        <h2 id="stats-heading" className="sr-only">
          Statistics
        </h2>
        <div className="rounded-lg bg-surface p-6 sm:p-8">
          <dl className="flex flex-wrap items-end gap-x-14 gap-y-6">
            <div>
              <dt className="text-[0.9375rem] text-muted">Win rate</dt>
              <dd className="mt-1 text-[3.5rem] leading-none font-extrabold tabular-nums">
                {winRate}
              </dd>
            </div>
            <div>
              <dt className="text-[0.9375rem] text-muted">Online games</dt>
              <dd className="mt-1 text-[2rem] leading-none font-bold tabular-nums">
                {stats.played}
              </dd>
            </div>
            {parts.map((part) => (
              <div key={part.label}>
                <dt className="flex items-center gap-2 text-[0.9375rem] text-muted">
                  <span
                    aria-hidden
                    className={clsx("size-2.5 rounded-full", part.className)}
                  />
                  {part.label}
                </dt>
                <dd className="mt-1 text-[2rem] leading-none font-bold tabular-nums">
                  {part.value}
                </dd>
              </div>
            ))}
          </dl>

          <div
            aria-hidden
            className="mt-8 flex h-3 gap-0.5 overflow-hidden rounded-full bg-raised"
          >
            {stats.played > 0 &&
              parts
                .filter((part) => part.value > 0)
                .map((part, index) => (
                  <span
                    key={part.label}
                    className={clsx(
                      "h-full origin-left animate-[grow_0.9s_var(--ease-out-expo)_backwards]",
                      part.className,
                    )}
                    style={{
                      width: `${(part.value / stats.played) * 100}%`,
                      animationDelay: `${200 + index * 120}ms`,
                    }}
                  />
                ))}
          </div>
          <p className="mt-4 text-sm text-faint">
            Completed online games only. Offline games aren&rsquo;t recorded.
          </p>
        </div>
      </section>

      <section aria-labelledby="history-heading" className="reveal mt-24">
        <h2
          id="history-heading"
          className="text-[2rem] leading-tight font-extrabold"
        >
          Recent games
        </h2>
        {recent.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-line-strong px-6 py-12 text-center">
            <p className="text-base font-semibold">
              No completed online games yet.
            </p>
            <p className="mt-1.5 text-sm text-muted">
              Finished games appear here with their result.
            </p>
          </div>
        ) : (
          <ul className="mt-6 grid grid-cols-1 gap-1.5">
            {recent.map((game) => (
              <li
                key={game.id}
                className="flex items-center gap-3 rounded-lg bg-surface px-4 py-3.5 text-[0.9375rem] transition-colors hover:bg-raised sm:gap-4 sm:px-5 sm:py-4"
              >
                <span
                  className={clsx(
                    "w-14 shrink-0 rounded px-2 py-1 text-center text-[0.8125rem] font-bold",
                    game.outcome === "win" && "bg-[#1f3a2a] text-positive",
                    game.outcome === "loss" && "bg-danger-soft text-[#f4aaa1]",
                    game.outcome === "draw" && "bg-raised text-muted",
                  )}
                >
                  {game.outcome === "win"
                    ? "Win"
                    : game.outcome === "loss"
                      ? "Loss"
                      : "Draw"}
                </span>
                <span className="min-w-0 flex-1 sm:truncate">
                  <span className="block truncate sm:inline">
                    vs <span className="font-bold">{game.opponentName}</span>
                  </span>
                  <span className="block truncate text-sm text-muted sm:inline sm:text-[0.9375rem]">
                    <span className="hidden sm:inline"> · </span>
                    {game.color === "w" ? "White" : "Black"} · {game.reason.replace(/-/g, " ")}
                  </span>
                </span>
                <span className="hidden shrink-0 text-sm text-muted tabular-nums sm:inline">
                  {formatTimeControl(game.initialMs, game.incrementMs)}
                </span>
                <span className="w-16 shrink-0 text-right text-sm text-faint tabular-nums">
                  {SHORT_DATE.format(new Date(game.endedAt))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function UsernameForm({
  current,
  onSave,
}: {
  current: string | null;
  onSave: (name: string) => Promise<string | null>;
}) {
  const [name, setName] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const check = useUsernameCheck(name, current);
  const unchanged = name === current;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || unchanged) return;
    setSaving(true);
    setSaved(false);
    const failure = await onSave(name);
    setSaving(false);
    setError(failure);
    setSaved(!failure);
  };

  return (
    <form onSubmit={save} noValidate className="mt-6 space-y-4">
      <Field
        label="Username"
        value={name}
        onChange={(value) => {
          setName(value.replace(/\s/g, ""));
          setSaved(false);
        }}
        maxLength={20}
        autoCapitalize="none"
        autoComplete="username"
        error={error}
        hint={
          unchanged ? "Your current username." : <UsernameHint check={check} />
        }
      />
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          size="sm"
          variant="primary"
          disabled={saving || unchanged}
          aria-busy={saving}
        >
          {saving ? "Saving…" : "Change username"}
        </Button>
        {saved && (
          <span role="status" className="animate-rise text-sm text-positive">
            Saved
          </span>
        )}
      </div>
    </form>
  );
}

function PasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{
    password?: string | null;
    confirm?: string | null;
  }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const found = {
      password: validatePassword(password),
      confirm: password === confirm ? null : "password_mismatch",
    };
    setErrors(found);
    setDone(false);
    if (found.password || found.confirm) return;
    const supabase = getBrowserClient();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: failure } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (!failure) {
      setDone(true);
      setPassword("");
      setConfirm("");
      return;
    }
    const code = authErrorCode(failure);
    if (code === "weak_password" || code === "same_password")
      setErrors({ password: code });
    else setError(code);
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <h3 className="text-lg font-bold">Change password</h3>
      <Field
        label="New password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        maxLength={72}
        error={errors.password}
      />
      <Field
        label="Confirm password"
        type="password"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        maxLength={72}
        error={errors.confirm}
      />
      <FormAlert error={error} />
      {error === "reauthentication_needed" && (
        <Link
          href="/forgot-password"
          className="text-xs text-accent hover:underline"
        >
          Send a reset email instead
        </Link>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={busy} aria-busy={busy}>
          {busy ? "Saving…" : "Update password"}
        </Button>
        {done && (
          <span role="status" className="animate-rise text-sm text-positive">
            {errorMessage("password_updated")}
          </span>
        )}
      </div>
    </form>
  );
}
