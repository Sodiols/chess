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
import { errorMessage, type PlayerStats, type RecentGame } from "@/lib/multiplayer/types";
import { formatTimeControl } from "@/lib/chess/format";

const DATE = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric" });
const SHORT_DATE = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

export function ProfileView() {
  const router = useRouter();
  const { state, auth, retry, setUsername } = usePlayer({ revalidate: true });

  useEffect(() => {
    if (auth.status === "signed-out" || auth.status === "anonymous") router.replace(loginHref("/profile"));
  }, [auth.status, router]);

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16 sm:px-5 sm:pt-10">
        {auth.status === "unconfigured" ? (
          <p className="py-16 text-center text-sm text-muted">Accounts aren&rsquo;t configured on this server.</p>
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
            <header className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Profile</p>
                <h1 className="mt-1 text-2xl font-bold sm:text-[1.75rem]">{state.profile.username ?? "New player"}</h1>
                <p className="mt-1 text-sm text-muted">
                  Member since {DATE.format(new Date(auth.user.created_at ?? state.profile.createdAt))}
                </p>
              </div>
              <Link
                href="/play"
                className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-[#231a0c] hover:bg-[#dcb673]"
              >
                Play
              </Link>
            </header>
            <Stats />
            <section id="settings" aria-labelledby="settings-heading" className="mt-12 scroll-mt-20">
              <h2 id="settings-heading" className="text-lg font-semibold">
                Account settings
              </h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="panel p-5">
                  <dl className="space-y-3 text-sm">
                    <div>
                      <dt className="eyebrow">Email</dt>
                      <dd className="mt-0.5 break-all">{auth.user.email}</dd>
                    </div>
                  </dl>
                  <UsernameForm current={state.profile.username} onSave={setUsername} />
                </div>
                <div className="panel p-5">
                  <PasswordForm />
                  <div className="mt-6 border-t border-line pt-5">
                    <Button
                      variant="danger"
                      onClick={() => void signOut().then(() => router.push("/"))}
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
  const [data, setData] = useState<{ stats: PlayerStats; recent: RecentGame[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void api<{ stats: PlayerStats; recent: RecentGame[] }>("/api/profile/stats").then((result) => {
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
  const winRate = stats.played ? `${Math.round((stats.wins / stats.played) * 100)}%` : "—";
  const tiles = [
    { label: "Online games", value: stats.played },
    { label: "Wins", value: stats.wins },
    { label: "Losses", value: stats.losses },
    { label: "Draws", value: stats.draws },
    { label: "Win rate", value: winRate },
  ];

  return (
    <>
      <section aria-labelledby="stats-heading" className="mt-8">
        <h2 id="stats-heading" className="sr-only">
          Statistics
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {tiles.map((tile) => (
            <div key={tile.label} className="rounded-xl border border-line bg-surface px-4 py-3">
              <dt className="eyebrow">{tile.label}</dt>
              <dd className="numeric mt-1 text-2xl font-semibold">{tile.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-faint">Completed online games only. Offline games aren&rsquo;t recorded.</p>
      </section>

      <section aria-labelledby="history-heading" className="mt-10">
        <h2 id="history-heading" className="text-lg font-semibold">
          Recent games
        </h2>
        {recent.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-line px-4 py-10 text-center">
            <p className="text-sm font-medium">No completed online games yet.</p>
            <p className="mt-1 text-xs text-faint">Finished games appear here with their result.</p>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-surface">
            {recent.map((game) => (
              <li key={game.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span
                  className={clsx(
                    "w-12 shrink-0 rounded-md px-2 py-0.5 text-center text-xs font-semibold",
                    game.outcome === "win" && "bg-[#1f3a2a] text-positive",
                    game.outcome === "loss" && "bg-danger-soft text-[#f0a49b]",
                    game.outcome === "draw" && "bg-raised text-muted",
                  )}
                >
                  {game.outcome === "win" ? "Win" : game.outcome === "loss" ? "Loss" : "Draw"}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  vs <span className="font-medium">{game.opponentName}</span>
                  <span className="text-muted"> · {game.color === "w" ? "White" : "Black"} · {game.reason.replace(/-/g, " ")}</span>
                </span>
                <span className="numeric hidden shrink-0 text-xs text-muted sm:inline">
                  {formatTimeControl(game.initialMs, game.incrementMs)}
                </span>
                <span className="shrink-0 text-xs text-faint">{SHORT_DATE.format(new Date(game.endedAt))}</span>
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
    <form onSubmit={save} noValidate className="mt-5 space-y-3">
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
        hint={unchanged ? "Your current username." : <UsernameHint check={check} />}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" variant="primary" disabled={saving || unchanged} aria-busy={saving}>
          {saving ? "Saving…" : "Change username"}
        </Button>
        {saved && (
          <span role="status" className="text-xs text-positive">
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
  const [errors, setErrors] = useState<{ password?: string | null; confirm?: string | null }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const found = { password: validatePassword(password), confirm: password === confirm ? null : "password_mismatch" };
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
    if (code === "weak_password" || code === "same_password") setErrors({ password: code });
    else setError(code);
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <h3 className="text-sm font-semibold">Change password</h3>
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
        <Link href="/forgot-password" className="text-xs text-accent hover:underline">
          Send a reset email instead
        </Link>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={busy} aria-busy={busy}>
          {busy ? "Saving…" : "Update password"}
        </Button>
        {done && (
          <span role="status" className="text-xs text-positive">
            {errorMessage("password_updated")}
          </span>
        )}
      </div>
    </form>
  );
}
