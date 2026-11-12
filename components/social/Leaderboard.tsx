"use client";

import Link from "next/link";
import { useState } from "react";
import { usePlayer } from "@/hooks/usePlayer";
import { useSocialQuery } from "@/hooks/useSocialQuery";
import { Button } from "@/components/ui/Button";
import { loginHref } from "@/lib/auth/validation";
import { errorMessage } from "@/lib/multiplayer/types";
import { gameCount, winRate, type PersonalStanding, type Standing } from "@/lib/social/types";
import { Country, CountrySelect, PlayerLink, RankMark, SocialPage } from "./SocialUI";

const scopes = ["world", "country", "friends"] as const;
type Scope = typeof scopes[number];

export function Leaderboard() {
  const { auth } = usePlayer();
  const signedIn = auth.status === "signed-in";
  const [scope, setScope] = useState<Scope>("world");
  const [country, setCountry] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const { result: personal } = useSocialQuery<{ me: PersonalStanding | null }>("/api/social/leaderboard", { interval: 20_000 });
  const selected = country ?? (personal?.ok ? personal.me?.country_code ?? "" : "");
  const params = new URLSearchParams({ scope, country: selected, search, offset: String(page * 25) });
  const unavailable = (scope === "friends" && !signedIn) || (scope === "country" && !selected);
  const { result } = useSocialQuery<{ rows: Standing[]; me: PersonalStanding | null }>(
    unavailable ? null : `/api/social/leaderboard?${params}`, { public: !signedIn, interval: 20_000 },
  );
  const me = result?.ok && result.me ? result.me : personal?.ok ? personal.me : null;

  return <SocialPage title="Leaderboard">
    <div className="flex flex-wrap gap-2" aria-label="Leaderboard category">
      {scopes.map((item) => <Button key={item} variant={scope === item ? "secondary" : "ghost"} aria-pressed={scope === item}
        className="min-h-11 capitalize" onClick={() => { setScope(item); setPage(0); }}>{item}</Button>)}
    </div>
    {me && <dl className="my-5 grid grid-cols-2 gap-4 rounded-md bg-surface px-4 py-4 sm:grid-cols-4">
      {[["Your rating", me.rating], ["World rank", me.world_rank], ["Country rank", me.country_rank], ["Friends rank", me.friends_rank]].map(([label, value]) =>
        <div key={label}><dt className="text-sm text-muted">{label}</dt><dd className="mt-1 text-xl font-bold tabular-nums">{value ?? "—"}</dd></div>)}
    </dl>}
    {scope === "friends" && !signedIn ? <p className="mt-6"><Link href={loginHref("/leaderboard")} className="text-accent underline">Log in to view friends rankings</Link></p> : <>
      <form className="my-6 flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); setSearch(draft.trim()); setPage(0); }}>
        {scope === "country" && <CountrySelect value={selected} onChange={(value) => { setCountry(value); setPage(0); }} />}
        <label className="grid gap-1.5 text-sm text-muted">Username
          <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={20} type="search" className="min-h-11 min-w-0 rounded-md bg-raised px-3 text-ink" />
        </label>
        <Button type="submit" className="min-h-11">Search</Button>
      </form>
      {scope === "country" && !selected ? <p className="text-muted">Select a country to see its standings.</p>
        : !result ? <p role="status" className="text-muted">Loading rankings…</p>
        : !result.ok ? <p role="alert">{errorMessage(result.error)}</p> : <>
          {scope === "friends" && me && !me.has_friends && <p className="mb-4 text-muted">Your friends list is empty. <Link href="/friends" className="text-accent underline">Add friends</Link></p>}
          {!result.rows.length ? <p className="rounded-md bg-surface p-5 text-muted">No ranked players match this view.</p> :
            <>
              <ol className="divide-y divide-line rounded-md bg-surface sm:hidden">
                {result.rows.slice(0, 25).map((row) => {
                  const own = auth.status === "signed-in" && auth.user.id === row.player_id;
                  return <li key={row.player_id} className={`grid gap-2 px-3 py-3 ${own ? "bg-accent-soft" : ""}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="text-sm text-muted tabular-nums">#{row.position}</span>
                        {scope === "friends" && <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-sm bg-raised text-xs uppercase">{row.username[0]}</span>}
                        <Country code={row.country_code} /><PlayerLink username={row.username} />
                        {own && <span className="text-xs text-muted">You</span>}
                      </div>
                      <RankMark rating={row.rating} tier={row.tier} />
                    </div>
                    <p className="text-xs text-muted tabular-nums">{scope === "country" && `World #${row.world_rank} · `}
                      {gameCount(row)} played · {row.wins} wins · {winRate(row)}% win rate</p>
                  </li>;
                })}
              </ol>
              <div className="hidden overflow-x-auto rounded-md bg-surface sm:block">
              <table className="w-full whitespace-nowrap text-left text-sm">
                <thead className="text-muted"><tr>
                  <th scope="col" className="p-3">{scope === "country" ? "Country" : scope === "friends" ? "Friends" : "World"}</th>
                  {scope === "country" && <th scope="col" className="p-3">World</th>}
                  <th scope="col" className="p-3">Player</th><th scope="col" className="p-3">Rank and rating</th>
                  <th scope="col" className="p-3 text-right">Played</th><th scope="col" className="p-3 text-right">Wins</th>
                  <th scope="col" className="p-3 text-right">Win rate</th>
                </tr></thead>
                <tbody>{result.rows.slice(0, 25).map((row) => {
                  const own = auth.status === "signed-in" && auth.user.id === row.player_id;
                  return <tr key={row.player_id} className={own ? "border-t border-line bg-accent-soft" : "border-t border-line"}>
                    <td className="p-3 tabular-nums">{row.position}</td>
                    {scope === "country" && <td className="p-3 tabular-nums">{row.world_rank}</td>}
                    <td className="p-3"><div className="flex items-center gap-2">
                      {scope === "friends" && <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-sm bg-raised text-xs uppercase">{row.username[0]}</span>}
                      <Country code={row.country_code} /><PlayerLink username={row.username} />{own && <span className="text-muted">You</span>}</div></td>
                    <td className="p-3"><RankMark rating={row.rating} tier={row.tier} /></td>
                    <td className="p-3 text-right tabular-nums">{gameCount(row)}</td><td className="p-3 text-right tabular-nums">{row.wins}</td><td className="p-3 text-right tabular-nums">{winRate(row)}%</td>
                  </tr>;
                })}</tbody>
              </table>
              </div>
            </>}
          {(page > 0 || result.rows.length > 25) && <div className="mt-4 flex items-center gap-3">
            <Button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
            <span className="text-sm text-muted">Page {page + 1}</span>
            <Button disabled={result.rows.length <= 25} onClick={() => setPage(page + 1)}>Next</Button>
          </div>}
          <p className="mt-4 text-sm text-muted">Standings start after your first rated result. Players with the same rating are ordered by ranked wins, then by player ID.</p>
        </>}
    </>}
  </SocialPage>;
}
