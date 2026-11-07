"use client";

import { OnlineShell } from "@/components/play/OnlineShell";
import { Matchmaking } from "@/components/matchmaking/Matchmaking";

export default function OnlinePlayPage() {
  return (
    <OnlineShell title="Play online" description="Find an opponent and start a live chess match.">
      {(profile) => <Matchmaking profile={profile} />}
    </OnlineShell>
  );
}
