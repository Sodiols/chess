"use client";

import Link from "next/link";
import { useState } from "react";
import { usePlayer } from "@/hooks/usePlayer";
import { errorMessage, type Profile } from "@/lib/multiplayer/types";
import { Button } from "@/components/ui/Button";

interface OnlineGateProps {
  children: (profile: Profile) => React.ReactNode;
  /** In-game: no nickname bar or resume banner, just the content. */
  bare?: boolean;
}

/**
 * Signs the visitor in as a guest and shows their nickname before any online
 * screen. Offline modes never render this, so they never touch Supabase.
 */
export function OnlineGate({ children, bare = false }: OnlineGateProps) {
  const { state, rename, retry } = usePlayer();

  if (state.status === "unconfigured") {
    return (
      <Notice title="Online play isn't set up yet">
        This copy of Gambit has no Supabase project configured. Offline modes still work —
        see <code className="numeric text-ink">SUPABASE.md</code> to enable online play.
        <div className="mt-5 flex justify-center gap-2">
          <Link href="/play/computer" className="rounded-lg bg-raised px-4 py-2 text-sm text-ink hover:bg-[#26262b]">
            Play computer
          </Link>
          <Link href="/play/local" className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-raised hover:text-ink">
            Local 1v1
          </Link>
        </div>
      </Notice>
    );
  }
  if (state.status === "loading") {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-sm text-muted" role="status">
        <span aria-hidden className="size-5 animate-spin rounded-full border-2 border-line border-t-accent" />
        Connecting…
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <Notice title="Couldn't connect">
        {errorMessage(state.error)}
        <div className="mt-5">
          <Button onClick={retry}>Try again</Button>
        </div>
      </Notice>
    );
  }

  const { profile } = state;
  if (bare) return <>{children(profile)}</>;
  return (
    <>
      <NicknameBar profile={profile} rename={rename} />
      {profile.activeGameId && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/50 bg-accent-soft/50 px-4 py-3">
          <p className="text-sm">You have a game in progress.</p>
          <Link
            href={`/game/${profile.activeGameId}`}
            className="rounded-md bg-accent px-3 py-1.5 text-[0.8125rem] font-semibold text-[#231a0c] hover:bg-[#dcb673]"
          >
            Resume game
          </Link>
        </div>
      )}
      {children(profile)}
    </>
  );
}

function NicknameBar({ profile, rename }: { profile: Profile; rename: (name: string) => Promise<string | null> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile.nickname);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const failure = await rename(draft);
    setSaving(false);
    setError(failure && errorMessage(failure));
    if (!failure) setEditing(false);
  };

  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <span className="eyebrow">Playing as</span>
      {editing ? (
        <form onSubmit={save} className="flex flex-wrap items-center gap-2">
          <label htmlFor="nickname" className="sr-only">
            Nickname
          </label>
          <input
            id="nickname"
            value={draft}
            maxLength={20}
            autoFocus
            autoComplete="nickname"
            onChange={(event) => setDraft(event.target.value)}
            className="h-9 w-44 rounded-lg border border-line bg-raised px-3 text-sm focus:border-accent focus:outline-none"
          />
          <Button type="submit" size="sm" variant="primary" disabled={saving}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          {error && <p className="w-full text-xs text-[#f2a79e]">{error}</p>}
        </form>
      ) : (
        <>
          <span className="font-semibold">{profile.nickname}</span>
          <button
            type="button"
            onClick={() => {
              setDraft(profile.nickname);
              setEditing(true);
            }}
            className="rounded px-1.5 text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
          >
            Change
          </button>
        </>
      )}
    </div>
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
