"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { usePlayer } from "@/hooks/usePlayer";
import { api } from "@/lib/multiplayer/client";
import { errorMessage } from "@/lib/multiplayer/types";
import { CountrySelect, socialErrors } from "./SocialUI";

export function CountryOnboarding() {
  const pathname = usePathname();
  const { state, retry } = usePlayer();
  if (pathname === "/auth/callback" || pathname === "/reset-password") return null;
  if (state.status !== "ready" || state.profile.countryCode !== null) return null;
  return <ChooseCountry key={state.profile.id} userId={state.profile.id} refresh={retry} />;
}

function ChooseCountry({ userId, refresh }: { userId: string; refresh: () => Promise<void> | undefined }) {
  const [country, setCountry] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!country || busy) return;
    setBusy(true);
    setError(null);
    const result = await api("/api/social/country", {
      method: "POST", body: { country }, expectedUserId: userId,
    });
    if (result.ok) await refresh();
    else setError(socialErrors[result.error] ?? errorMessage(result.error));
    setBusy(false);
  };

  return (
    <Dialog open dismissible={false} onClose={() => {}} title="Choose your country"
      description="Your country appears on your public profile and determines your country leaderboard.">
      <form onSubmit={save} className="space-y-4">
        <CountrySelect value={country} onChange={setCountry} required />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button type="submit" variant="primary" size="lg" block disabled={!country || busy}>
          {busy ? "Saving…" : "Save country"}
        </Button>
      </form>
    </Dialog>
  );
}
