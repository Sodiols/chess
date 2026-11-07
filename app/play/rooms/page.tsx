"use client";

import { OnlineShell } from "@/components/play/OnlineShell";
import { RoomsLobby } from "@/components/rooms/RoomsLobby";

export default function RoomsPage() {
  return (
    <OnlineShell
      title="Private match"
      description="Play a friend with a room ID and a password."
      width="wide"
    >
      {(profile) => <RoomsLobby profile={profile} />}
    </OnlineShell>
  );
}
