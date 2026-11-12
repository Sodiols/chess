"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/multiplayer/client";
import { errorMessage } from "@/lib/multiplayer/types";
import { loginHref } from "@/lib/auth/validation";
import { useAuth } from "@/lib/auth/session";
import { useSocialQuery } from "@/hooks/useSocialQuery";
import { activityLabel, type Friend, type FriendDetails, type FriendsResponse, type Invitation } from "@/lib/social/types";
import { formatTimeControl } from "@/lib/chess/format";
import { Country, PlayerLink, RankMark, SocialPage, socialErrors } from "./SocialUI";
import { useFriendPresence } from "./PlayerActivity";

export function FriendActions({ friend, viewer, onChange }: { friend: Friend; viewer: string; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (action: string) => {
    setBusy(true);
    const response = await api("/api/social/friend", { method: "POST", body: { id: friend.player_id, action } });
    setBusy(false);
    setError(response.ok ? null : response.error);
    if (response.ok) onChange();
  };
  const pending = friend.status === "pending";
  const accepted = friend.status === "accepted";
  const own = friend.requester === viewer;
  const button = (action: string, label: string) => <Button size="sm" className="min-h-11" disabled={busy} onClick={() => void act(action)}>{label}</Button>;
  return <div className="flex flex-wrap items-center gap-2">
    {accepted ? <>
      <Link className="inline-flex min-h-11 items-center px-2 text-sm text-accent hover:underline" href={`/play/rooms?invite=${encodeURIComponent(friend.username)}#create-heading`}>Invite to match</Link>
      {friend.presence?.watch && <Link className="inline-flex min-h-11 items-center px-2 text-sm text-accent hover:underline" href={`/spectate/${friend.presence.watch}`}>Spectate</Link>}
      {button("remove", "Remove friend")}
    </> : pending ? own ? button("cancel", "Cancel request") : <>{button("accept", "Accept")}{button("decline", "Decline")}</> : button("request", "Add friend")}
    {error && <p role="alert" className="basis-full text-sm text-danger">{socialErrors[error] ?? errorMessage(error)}</p>}
  </div>;
}

export function PublicPlayerActions({ player }: { player: Pick<Friend, "player_id" | "username" | "rating" | "tier" | "country_code"> }) {
  const auth = useAuth();
  const viewer = auth.status === "signed-in" ? auth.user.id : null;
  const { result, refresh } = useSocialQuery<FriendDetails>(
    viewer && viewer !== player.player_id ? `/api/social/friend?id=${player.player_id}` : null, { interval: 15_000 },
  );
  if (viewer === player.player_id) return <div className="flex flex-wrap gap-4 text-sm text-accent">
    <Link className="underline" href="/profile#settings">Edit profile and account settings</Link><Link className="underline" href="/friends">My friends</Link>
  </div>;
  if (!viewer) return <Link href={loginHref(`/u/${player.username}`)} className="text-sm text-accent underline">Log in to add a friend</Link>;
  if (!result?.ok) return result && <p role="alert">{errorMessage(result.error)}</p>;
  return <>
    {result.presence && <p className="mb-2 text-sm text-muted">{activityLabel[result.presence.activity]}</p>}
    <FriendActions friend={{ ...player, ...result }} viewer={viewer} onChange={refresh} />
  </>;
}

function InvitationRow({ invite, refresh }: { invite: Invitation; refresh: () => void }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reply = async (action: string) => {
    setBusy(true);
    const response = await api<{ gameId?: string }>("/api/social/invite", { method: "POST", body: { id: invite.id, action, password } });
    setBusy(false);
    if (!response.ok) setError(response.error);
    else if (response.gameId) router.push(`/game/${response.gameId}`);
    else refresh();
  };
  return <details id={`invitation-${invite.id}`} className="scroll-mt-24 rounded-md bg-surface p-4">
    <summary className="cursor-pointer font-semibold">View invitation from {invite.host_name}</summary>
    <p className="mt-2 font-semibold">{invite.name}</p>
    <p className="mt-2 text-sm text-muted">{invite.ranked ? "Ranked" : "Casual"} · {formatTimeControl(invite.initial_ms, invite.increment_ms)}</p>
    <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); void reply("accept"); }}>
      <label className="grid gap-1 text-sm">Room password<input className="min-h-11 rounded-md bg-raised px-3" type="password"
        value={password} maxLength={64} onChange={(event) => setPassword(event.target.value)} required /></label>
      <Button type="submit" disabled={busy} className="min-h-11">Accept and join</Button>
      <Button disabled={busy} className="min-h-11" variant="ghost" onClick={() => void reply("decline")}>Decline</Button>
    </form>
    {error && <p className="mt-2 text-sm text-danger" role="alert">{socialErrors[error] ?? errorMessage(error)}</p>}
  </details>;
}

export function Friends() {
  const auth = useAuth();
  const viewer = auth.status === "signed-in" ? auth.user.id : null;
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const query = new URLSearchParams({ search, offset: String(offset) });
  const { result, refresh } = useSocialQuery<FriendsResponse>(viewer ? `/api/social/friends?${query}` : null, { interval: 12_000 });
  const people = result?.ok ? result.people.slice(0, 30) : [];
  const presenceKey = people.flatMap((friend) => friend.presence?.topic ? [friend.presence.topic] : []).sort().join(",");
  useFriendPresence(presenceKey, refresh);
  useEffect(() => {
    window.addEventListener("gambit-social-update", refresh);
    return () => window.removeEventListener("gambit-social-update", refresh);
  }, [refresh]);

  const sections = search ? [["Search results", people] as const] : [
    ["My friends", people.filter((p) => p.status === "accepted")],
    ["Friend requests", people.filter((p) => p.status === "pending" && p.requester !== viewer)],
    ["Sent requests", people.filter((p) => p.status === "pending" && p.requester === viewer)],
  ] as const;

  return <SocialPage title="Friends">
    {!viewer ? <p>{auth.status === "loading" ? "Loading…" : <Link className="text-accent underline" href={loginHref("/friends")}>Log in to see your friends</Link>}</p> : <>
      <form onSubmit={(event) => { event.preventDefault(); setSearch(draft.trim()); setOffset(0); }} className="mb-6 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm">Search players<input type="search" value={draft} maxLength={20}
          onChange={(event) => setDraft(event.target.value)} className="min-h-11 rounded-md bg-raised px-3" placeholder="Username" /></label>
        <Button type="submit" className="min-h-11">Search</Button>
        {search && <Button onClick={() => { setDraft(""); setSearch(""); setOffset(0); }} className="min-h-11" variant="ghost">Clear search</Button>}
      </form>
      {!result ? <p role="status">Loading friends…</p> : !result.ok ? <p role="alert">{errorMessage(result.error)}</p> : <>
        {!!result.invites.length && <section className="mb-8 grid gap-2"><h2 className="text-xl font-bold">Match invitations</h2>
          {result.invites.map((invite) => <InvitationRow key={invite.id} invite={invite} refresh={refresh} />)}</section>}
        <div className="grid gap-8">{sections.map(([title, list]) => <section key={title}>
          <h2 className="mb-3 text-xl font-bold">{title}</h2>
          {!list.length ? <p className="rounded-md bg-surface p-4 text-sm text-muted">No players to show here yet.</p> : <ul className="divide-y divide-line rounded-md bg-surface">
            {list.map((friend) => <li key={friend.player_id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-raised font-bold uppercase text-accent" aria-hidden="true">{friend.username[0]}</span>
                <div className="grid min-w-0 gap-1"><span className="flex gap-2"><PlayerLink username={friend.username} /><Country code={friend.country_code} /></span>
                  <div className="flex flex-wrap gap-2"><RankMark rating={friend.rating} tier={friend.tier} />
                    {friend.presence && <span className="text-sm text-muted">{activityLabel[friend.presence.activity]}</span>}</div></div>
              </div>
              <FriendActions friend={friend} viewer={viewer} onChange={refresh} />
            </li>)}
          </ul>}
        </section>)}</div>
        {(offset > 0 || result.people.length > 30) && <div className="mt-4 flex gap-2">
          <Button disabled={offset === 0} onClick={() => setOffset(offset - 30)}>Previous</Button>
          <Button disabled={result.people.length <= 30} onClick={() => setOffset(offset + 30)}>Next</Button>
        </div>}
      </>}
    </>}
  </SocialPage>;
}
