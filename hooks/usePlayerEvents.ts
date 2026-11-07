"use client";

import { useEffect, useRef } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";

/**
 * Listens on the private `player:{id}` topic for "your game has started",
 * which the database sends when a matchmaking partner or room guest arrives.
 */
export function usePlayerEvents(playerId: string | null, onGameStarted: (gameId: string) => void) {
  const handler = useRef(onGameStarted);
  useEffect(() => {
    handler.current = onGameStarted;
  });

  useEffect(() => {
    const supabase = getBrowserClient();
    if (!supabase || !playerId) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    void (async () => {
      try {
        await supabase.realtime.setAuth();
      } catch {
        return; // Callers also poll the server, so a missed event only costs a few seconds.
      }
      if (cancelled) return;
      channel = supabase
        .channel(`player:${playerId}`, { config: { private: true } })
        .on("broadcast", { event: "game_started" }, ({ payload }) => {
          const gameId = (payload as { gameId?: unknown }).gameId;
          if (typeof gameId === "string") handler.current(gameId);
        })
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [playerId]);
}
