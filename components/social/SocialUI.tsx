import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import "flag-icons/css/flag-icons.min.css";
import { countries, countryName, ratingTier, type Tier } from "@/lib/social/types";

const emblem: Record<Tier, string> = {
  Bronze: "M3 5h10v6H3z", Silver: "M8 2l6 6-6 6-6-6z", Gold: "M8 2l6 3v6l-6 3-6-3V5z",
  Platinum: "M8 2l5 2v5l-5 5-5-5V4z", Diamond: "M4 3h8l3 4-7 7-7-7z", Master: "M2 4l3 3 3-4 3 4 3-3-1 9H3z",
};
const tones: Record<Tier, string> = {
  Bronze: "text-[#d59d79]", Silver: "text-[#c3ccd7]", Gold: "text-accent",
  Platinum: "text-[#9ecac5]", Diamond: "text-[#a9c1ef]", Master: "text-[#e3b8ed]",
};
export function RankMark({ rating, tier = ratingTier(rating), points = true }: { rating: number; tier?: Tier; points?: boolean }) {
  return <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${tones[tier]}`}>
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 shrink-0 fill-none stroke-current" strokeWidth="1.5">
      <path d={emblem[tier]} strokeLinejoin="round" />
    </svg>
    {tier}{points && <span className="tabular-nums text-ink">{rating.toLocaleString()}</span>}
  </span>;
}

export function Country({ code }: { code: string | null }) {
  if (!code) return null;
  return <span aria-label={countryName(code)} title={countryName(code)} className="inline-flex items-center gap-1.5">
    <span aria-hidden="true" className={`fi fi-${code.toLowerCase()}`} /><span className="sr-only">{countryName(code)}</span>
  </span>;
}

export function CountrySelect({ value, onChange, label = "Country" }: { value: string; onChange: (value: string) => void; label?: string }) {
  return <label className="grid gap-1.5 text-sm text-muted">
    {label}
    <select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 max-w-full rounded-md bg-raised px-3 text-ink">
      <option value="">No country selected</option>
      {countries.map((country) => <option value={country.code} key={country.code}>{country.name}</option>)}
    </select>
  </label>;
}

export function SocialPage({ title, children }: { title: string; children: React.ReactNode }) {
  return <><Navbar /><main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[72rem] px-4 py-8 sm:px-6 sm:py-12">
    <h1 className="mb-6 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
    {children}
  </main></>;
}

export function PlayerLink({ username }: { username: string }) {
  return <Link href={`/u/${encodeURIComponent(username)}`} className="min-w-0 truncate font-semibold hover:text-accent hover:underline">{username}</Link>;
}

export const socialErrors: Record<string, string> = {
  country_cooldown: "Country can be changed once every 30 days.",
  invalid_country: "Choose a country from the list.",
  friend_request_exists: "There is already a request or friendship between you.",
  friend_action_unavailable: "This request has changed. Refresh your friends list.",
  invite_exists: "This friend already has an invitation to the room.",
  watch_unavailable: "This match is unavailable to watch.",
  watch_sharing_disabled: "Enable friend spectating in your account settings before sharing.",
  stream_disconnected: "Stream disconnected.",
  watch_authorization_required: "Your viewing access expired. Rejoin to keep watching.",
};
