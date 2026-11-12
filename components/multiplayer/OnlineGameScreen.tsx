"use client";

import { Navbar } from "@/components/Navbar";
import { OnlineGate } from "./OnlineGate";
import { OnlineGame } from "./OnlineGame";

export function OnlineGameScreen({ gameId }: { gameId: string }) {
  return (
    <>
      <Navbar variant="game" />
      <main id="main-content" tabIndex={-1} className="pt-3">
        <OnlineGate bare>
          {/* Keyed so a rematch starts from a clean store and clock. */}
          {(profile) => <OnlineGame key={gameId} gameId={gameId} playerId={profile.id} />}
        </OnlineGate>
      </main>
    </>
  );
}
