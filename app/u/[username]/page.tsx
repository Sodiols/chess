import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminClient } from "@/lib/supabase/server";
import { countryName, gameCount, winRate, type PublicProfile } from "@/lib/social/types";
import { Country, RankMark, SocialPage } from "@/components/social/SocialUI";
import { PublicPlayerActions } from "@/components/social/Friends";
import { formatTimeControl } from "@/lib/chess/format";

export const dynamic = "force-dynamic";
export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  if (!/^[a-z0-9_]{3,20}$/i.test(username)) notFound();
  const admin = getAdminClient();
  if (!admin) return <SocialPage title="Player profile"><p>Profiles are unavailable on this server.</p></SocialPage>;
  const { data, error } = await admin.rpc("public_player", { p_username: username });
  if (error) return <SocialPage title="Player profile"><p role="alert">This profile could not be loaded. Refresh to try again.</p></SocialPage>;
  if (!data) notFound();
  const { profile, matches } = data as PublicProfile;
  const date = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

  return <SocialPage title={profile.username}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-center gap-4">
        <span aria-hidden="true" className="grid size-14 place-items-center rounded-md bg-accent-soft text-2xl font-bold uppercase text-accent">{profile.username[0]}</span>
        <div className="space-y-1"><div className="flex items-center gap-3"><RankMark rating={profile.rating} tier={profile.tier} /><Country code={profile.country_code} />{profile.country_code && <span className="text-sm text-muted">{countryName(profile.country_code)}</span>}</div>
          <p className="text-sm text-muted">Member since {date.format(new Date(profile.joined_at))}</p></div>
      </div>
      <div className="space-y-3">
        <PublicPlayerActions player={profile} />
        <div className="flex flex-wrap gap-4 text-sm text-accent">
          <Link className="underline" href="#rank">View rank</Link>
          <Link className="underline" href="#match-history">View match history</Link>
        </div>
      </div>
    </div>
    <section id="rank" className="my-8"><h2 className="mb-3 text-xl font-bold">Competitive record</h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-5 rounded-md bg-surface p-4 sm:grid-cols-4">
        {[["World rank", profile.world_rank], ["Country rank", profile.country_rank], ["Peak rating", profile.peak], ["Ranked games", gameCount(profile)],
          ["Wins", profile.wins], ["Losses", profile.losses], ["Draws", profile.draws], ["Win rate", `${winRate(profile)}%`]].map(([label, value]) =>
          <div key={label}><dt className="text-sm text-muted">{label}</dt><dd className="text-lg font-bold tabular-nums">{value ?? "—"}</dd></div>)}
      </dl>
    </section>
    <section id="match-history"><h2 className="mb-3 text-xl font-bold">Recent public matches</h2>
      {!matches.length ? <p className="text-muted">No public matches yet.</p> : <ul className="divide-y divide-line rounded-md bg-surface">
        {matches.map((match, index) => <li key={`${match.ended_at}-${index}`} className="flex flex-wrap justify-between gap-2 p-4 text-sm">
          <span className="font-semibold">{match.opponent}</span><span className="capitalize">{match.outcome}</span>
          <span className="text-muted">{formatTimeControl(match.initial_ms, match.increment_ms)} · {date.format(new Date(match.ended_at))}</span>
        </li>)}
      </ul>}
    </section>
  </SocialPage>;
}
