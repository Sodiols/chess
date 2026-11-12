"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/multiplayer/client";
import { useSocialQuery } from "@/hooks/useSocialQuery";
import { errorMessage } from "@/lib/multiplayer/types";
import { Button } from "@/components/ui/Button";
import type { FriendsResponse } from "@/lib/social/types";
import { PlayerLink, RankMark, socialErrors } from "./SocialUI";

export function InviteFriends({ code }: { code: string }) {
  const preferred = useSearchParams().get("invite") ?? "";
  const [showAll, setShowAll] = useState(false);
  const [offset, setOffset] = useState(0);
  const [sent, setSent] = useState<string[]>([]);
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { result } = useSocialQuery<FriendsResponse>(`/api/social/friends?offset=${offset}&search=${encodeURIComponent(showAll ? "" : preferred)}`);
  const send = async (id: string) => {
    setSending(id);
    const response = await api("/api/social/invite", { method: "POST", body: { id, action: "send", code } });
    if (response.ok || response.error === "invite_exists") setSent((list) => [...list, id]);
    setError(response.ok ? null : response.error);
    setSending(null);
  };
  const friends = result?.ok ? result.people.slice(0, 30).filter((person) => person.status === "accepted") : [];
  return <section className="mt-6 rounded-md bg-surface p-4" aria-label="Invite friends">
    <h2 className="mb-2 text-lg font-bold">Invite friends</h2>
    <p className="text-sm text-muted">Your friend still needs the room password. Share it separately.</p>
    {preferred && !showAll && <Button size="sm" variant="ghost" onClick={() => { setShowAll(true); setOffset(0); }}>Show all friends</Button>}
    {error && <p role="alert" className="mt-2 text-sm text-danger">{socialErrors[error] ?? errorMessage(error)}</p>}
    {!result ? <p role="status">Loading friends…</p> : !result.ok ? <p role="alert">{errorMessage(result.error)}</p> :
      !friends.length ? <p className="mt-3 text-sm text-muted">No accepted friends on this page.</p> :
      <ul className="mt-3 divide-y divide-line">{friends.map((friend) => <li key={friend.player_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <div className="flex min-w-0 flex-wrap gap-2"><PlayerLink username={friend.username} /><RankMark rating={friend.rating} tier={friend.tier} /></div>
        <Button disabled={sending !== null || sent.includes(friend.player_id)} onClick={() => void send(friend.player_id)}>
          {sent.includes(friend.player_id) ? "Invited" : sending === friend.player_id ? "Sending…" : "Invite"}
        </Button>
      </li>)}</ul>}
    {result?.ok && (offset > 0 || result.people.length > 30) && <div className="mt-3 flex gap-2">
      <Button disabled={offset === 0} onClick={() => setOffset(offset - 30)}>Previous</Button>
      <Button disabled={result.people.length <= 30} onClick={() => setOffset(offset + 30)}>Next</Button>
    </div>}
  </section>;
}
