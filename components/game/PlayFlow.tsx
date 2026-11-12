"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { AssistanceMode, GameConfig } from "@/types";
import { Navbar } from "@/components/Navbar";
import { ChessGame } from "./ChessGame";
import { GameSetup } from "./GameSetup";

interface PlayFlowProps {
  initialMode: AssistanceMode | null;
  variant?: "local" | "computer";
}

/**
 * Owns the setup → game → rematch cycle. Each new game gets a fresh `gameId`,
 * which remounts `ChessGame` so no state can survive from the previous one.
 */
export function PlayFlow({ initialMode, variant = "local" }: PlayFlowProps) {
  const router = useRouter();
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [gameId, setGameId] = useState(0);

  const start = useCallback((next: GameConfig) => {
    setConfig(next);
    setGameId((id) => id + 1);
  }, []);

  const rematch = useCallback(() => {
    setConfig((current) =>
      current
        ? {
            ...current,
            players: { w: current.players.b, b: current.players.w },
            bot: current.bot && { ...current.bot, color: current.bot.color === "w" ? "b" : "w" },
          }
        : current,
    );
    setGameId((id) => id + 1);
  }, []);

  const goHome = useCallback(() => router.push("/"), [router]);

  if (!config) {
    return (
      <>
        <Navbar />
        <main id="main-content" tabIndex={-1} className="pt-8 sm:pt-10">
          <GameSetup initialMode={initialMode} onStart={start} variant={variant} />
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar variant="game" />
      <main id="main-content" tabIndex={-1} className="pt-3">
        <ChessGame
          key={gameId}
          config={config}
          onRematch={rematch}
          onRestart={() => setGameId((id) => id + 1)}
          onNewGame={() => setConfig(null)}
          onHome={goHome}
        />
      </main>
    </>
  );
}
