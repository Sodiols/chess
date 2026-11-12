"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { GameConfig } from "@/types";
import { useSecretMode } from "@/hooks/useSecretMode";
import { Navbar } from "@/components/Navbar";
import { ChessGame } from "./ChessGame";

const CONFIG: GameConfig = {
  mode: "medium",
  players: { w: "White", b: "Black" },
  timeControl: null,
  analysis: true,
};

/** The owner's free analysis board. Everyone else sees an ordinary "not here" page. */
export function AnalysisSession() {
  const router = useRouter();
  const { isOwner, settings } = useSecretMode();
  const [session, setSession] = useState(0);

  if (!isOwner) {
    return (
      <>
        <Navbar />
        <main id="main-content" tabIndex={-1} className="mx-auto max-w-md px-6 pt-24 text-center">
          <h1 className="text-xl font-bold">Page not found</h1>
          <p className="mt-2 text-sm text-muted">
            <Link href="/play" className="text-accent hover:underline">
              Play a game
            </Link>{" "}
            instead.
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar variant="game" />
      <main id="main-content" tabIndex={-1} className="pt-3">
        {!settings.enabled && (
          <p className="mx-auto max-w-[92rem] px-3 pb-2 text-sm text-muted sm:px-6 lg:px-8">
            Secret Mode is off. Turn it on in Settings to see engine analysis.
          </p>
        )}
        <ChessGame
          key={session}
          config={CONFIG}
          onRematch={() => setSession((n) => n + 1)}
          onRestart={() => setSession((n) => n + 1)}
          onNewGame={() => setSession((n) => n + 1)}
          onHome={() => router.push("/")}
        />
      </main>
    </>
  );
}
