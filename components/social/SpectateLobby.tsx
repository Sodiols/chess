"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useSocialQuery } from "@/hooks/useSocialQuery";
import { useAuth } from "@/lib/auth/session";
import { loginHref } from "@/lib/auth/validation";
import { errorMessage } from "@/lib/multiplayer/types";
import { activityLabel, type FriendsResponse } from "@/lib/social/types";
import { useFriendPresence } from "./PlayerActivity";
import { SocialPage } from "./SocialUI";

export function SpectateLobby() {
  const auth = useAuth();
  const [offset, setOffset] = useState(0);
  const { result, refresh } = useSocialQuery<FriendsResponse>(
    auth.status === "signed-in" ? `/api/social/friends?offset=${offset}` : null,
    { interval: 12_000 },
  );
  const friends = result?.ok ? result.people.slice(0, 30) : [];
  const topics = friends.flatMap(({ presence }) => presence?.topic ? [presence.topic] : []).sort().join(",");
  useFriendPresence(topics, refresh);
  const watchable = friends.flatMap(({ player_id, username, presence }) =>
    presence?.watch ? [{ player_id, username, activity: presence.activity, match: presence.watch }] : [],
  );

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
              {watchable.map(({ player_id, username, activity, match }) => (
                <li key={player_id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                  <div>
                    <p className="font-semibold">{username}</p>
                    <p className="text-sm text-muted">{activityLabel[activity]}</p>
                  </div>
                  <Link className="inline-flex min-h-11 items-center rounded-md bg-raised px-4 text-sm font-semibold text-accent hover:underline" href={`/spectate/${match}`}>
                    Watch match<span className="sr-only"> with {username}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="rounded-md bg-surface p-4 text-sm text-muted">No watchable games from these friends right now.</p>}
          {result?.ok && (offset > 0 || result.people.length > 30) && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button className="min-h-11" disabled={offset === 0} onClick={() => setOffset(offset - 30)}>Previous friends</Button>
              <Button className="min-h-11" disabled={result.people.length <= 30} onClick={() => setOffset(offset + 30)}>Next friends</Button>
            </div>
          )}
        </>
      )}
      <Link className="mt-4 inline-flex min-h-11 items-center text-sm text-accent hover:underline" href="/friends">View friends</Link>
    </SocialPage>
  );
}
