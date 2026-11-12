"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/multiplayer/client";
import { errorMessage } from "@/lib/multiplayer/types";
import { useSocialQuery } from "@/hooks/useSocialQuery";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import type { PublicProfile, SocialSettings as Preferences } from "@/lib/social/types";
import { Country, CountrySelect, RankMark, socialErrors } from "./SocialUI";

export function PersonalRank({ username, link = false }: { username: string; link?: boolean }) {
  const { result, refresh } = useSocialQuery<PublicProfile>(`/api/social/profile?username=${encodeURIComponent(username)}`, { public: true });
  useEffect(() => {
    window.addEventListener("gambit-social-update", refresh);
    return () => window.removeEventListener("gambit-social-update", refresh);
  }, [refresh]);
  if (!result?.ok) return null;
  return <div className="mt-2 flex flex-wrap items-center gap-3">
    <RankMark rating={result.profile.rating} tier={result.profile.tier} />
    {link && <Link href={`/u/${username}`} className="text-sm text-accent hover:underline">View public profile</Link>}
  </div>;
}

export function SocialSettings({ username }: { username: string }) {
  const { result, refresh } = useSocialQuery<PublicProfile>(`/api/social/profile?username=${encodeURIComponent(username)}`, { public: true });
  const { result: preferences } = useSocialQuery<{ settings: Preferences }>("/api/social/settings");
  return <section id="social-settings" className="mt-8 rounded-md bg-surface p-5 sm:p-7">
    <h3 className="mb-4 text-xl font-bold">Country and privacy</h3>
    {result?.ok ? <CountryForm key={username} initial={result.profile.country_code} refresh={refresh} />
      : <p className="text-sm text-muted">{result ? "Country settings are unavailable." : "Loading country…"}</p>}
    {preferences?.ok ? <PreferencesForm initial={preferences.settings} />
      : <p className="mt-5 text-sm text-muted">{preferences ? "Privacy settings are unavailable." : "Loading privacy settings…"}</p>}
  </section>;
}

function CountryForm({ initial, refresh }: { initial: string | null; refresh: () => void }) {
  const [country, setCountry] = useState(initial ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const response = await api("/api/social/country", { method: "POST", body: { country: country || null } });
    setBusy(false);
    setMessage(response.ok ? "Country saved." : socialErrors[response.error] ?? errorMessage(response.error));
    if (response.ok) refresh();
  };
  return <form className="grid max-w-xs gap-3" onSubmit={(event) => { event.preventDefault(); void save(); }}>
    <CountrySelect value={country} onChange={setCountry} />
    {country && <Country code={country} />}
    <p className="text-sm text-muted">Country is self-reported and can change once every 30 days.</p>
    <Button type="submit" disabled={busy || country === (initial ?? "")}>Save country</Button>
    <p role="status" className="text-sm text-muted">{message}</p>
  </form>;
}

function PreferencesForm({ initial }: { initial: Preferences }) {
  const [settings, setSettings] = useState(initial);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const response = await api("/api/social/settings", { method: "POST", body: settings });
    setBusy(false);
    setMessage(response.ok ? "Privacy settings saved." : errorMessage(response.error));
    if (response.ok) window.dispatchEvent(new Event("gambit-social-update"));
  };
  return <form className="mt-5 grid max-w-lg gap-3" onSubmit={(event) => { event.preventDefault(); void save(); }}>
    <Toggle label="Show online status and activity to friends" checked={settings.show_activity}
      onChange={(show_activity) => setSettings({ ...settings, show_activity })} />
    <Toggle label="Allow friends to spectate my games" checked={settings.allow_friends}
      onChange={(allow_friends) => setSettings({ ...settings, allow_friends })} />
    <Toggle label="Allow spectators in ranked matches" checked={settings.allow_ranked}
      onChange={(allow_ranked) => setSettings({ ...settings, allow_ranked })} />
    <Button type="submit" disabled={busy}>Save privacy settings</Button>
    <p role="status" className="text-sm text-muted">{message}</p>
  </form>;
}
