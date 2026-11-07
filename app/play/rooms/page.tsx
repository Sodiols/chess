"use client";

import { OnlineShell } from "@/components/play/OnlineShell";
import { RoomsLobby } from "@/components/rooms/RoomsLobby";

export default function RoomsPage() {
  return (
    <OnlineShell
      title="Private match"
      description="Create a password-protected room or join another player's match."
      width="wide"
    >
      {(profile) => <RoomsLobby profile={profile} />}
    </OnlineShell>
  );
}
