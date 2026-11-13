"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useSocialQuery } from "@/hooks/useSocialQuery";
import { useAuth } from "@/lib/auth/session";
import { loginHref } from "@/lib/auth/validation";
import { errorMessage } from "@/lib/multiplayer/types";
import type { LiveSpectatorGame } from "@/lib/social/types";
import { SocialPage } from "./SocialUI";

export function SpectateLobby() {
  const auth = useAuth();
  const [offset, setOffset] = useState(0);
  const { result, refresh } = useSocialQuery<{ games: LiveSpectatorGame[] }>(
    auth.status === "signed-in" ? `/api/social/spectate?live=1&offset=${offset}` : null,
    { interval: 12_000 },
  );
  const watchable = result?.ok ? result.games.slice(0, 30) : [];

  return (
    <SocialPage title="Spectate">
      <p className="mb-4 text-sm text-muted">Watch live games that your friends have made available to you.</p>
      {auth.status === "loading" || (auth.status === "signed-in" && !result) ? (
        <p role="status">Loading live games…</p>
      ) : auth.status !== "signed-in" ? (
        <Link className="inline-flex min-h-11 items-center text-accent underline" href={loginHref("/spectate")}>Log in to watch</Link>
      ) : result && !result.ok ? (
        <div>
          <p role="alert">{errorMessage(result.error)}</p>
          <Button className="mt-2 min-h-11" onClick={() => void refresh()}>Retry</Button>
        </div>
      ) : (
        <>
          {watchable.length ? (
            <ul className="divide-y divide-line rounded-md bg-surface">
              {watchable.map(({ id, white, black, kind, ranked }) => (
                <li key={id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                  <div>
                    <p className="font-semibold">{white} vs {black}</p>
                    <p className="text-sm text-muted">{kind === "online" ? ranked ? "Ranked online" : "Casual online" : kind === "computer" ? "Vs computer" : "Local 1v1"}</p>
                  </div>
                  <Link className="inline-flex min-h-11 items-center rounded-md bg-raised px-4 text-sm font-semibold text-accent hover:underline" href={`/spectate/${id}`}>
                    Watch match<span className="sr-only"> {white} vs {black}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <div className="rounded-md bg-surface p-4 text-sm">
            <p className="font-semibold">No live games available to watch</p>
            <p className="mt-1 text-muted">Both players must allow friend spectating for an online match to appear. Ranked games also require ranked spectating to be enabled by both players.</p>
            <Link className="inline-flex min-h-11 items-center text-accent hover:underline" href="/profile#social-settings">Spectating settings</Link>
            <Button className="ml-2 min-h-11" variant="ghost" onClick={() => void refresh()}>Refresh games</Button>
          </div>}
          {result?.ok && (offset > 0 || result.games.length > 30) && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button className="min-h-11" disabled={offset === 0} onClick={() => setOffset(offset - 30)}>Previous games</Button>
              <Button className="min-h-11" disabled={result.games.length <= 30} onClick={() => setOffset(offset + 30)}>Next games</Button>
            </div>
          )}
        </>
      )}
      <Link className="mt-4 inline-flex min-h-11 items-center text-sm text-accent hover:underline" href="/friends">View friends</Link>
    </SocialPage>
  );
}
