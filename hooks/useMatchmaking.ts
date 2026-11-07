"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TimeControl } from "@/types";
import { api } from "@/lib/multiplayer/client";
import { usePlayerEvents } from "./usePlayerEvents";

/** Keeps the queue entry alive (it expires after 45 s) and re-tries the match. */
const HEARTBEAT_MS = 15_000;

type MatchResponse = { status: "waiting"; since: string } | { status: "matched"; gameId: string } | { status: "idle" };

export type MatchmakingState =
  | { status: "idle"; error?: string }
  | { status: "joining"; control: TimeControl }
  | { status: "searching"; control: TimeControl; since: number }
  | { status: "matched"; gameId: string };

/**
 * Random matchmaking. The server pairs players atomically; this hook enters the
 * queue, heartbeats it, and reports the game as soon as either the Realtime
 * notification or a heartbeat response says one exists.
 */
export function useMatchmaking(playerId: string | null, onMatched: (gameId: string) => void) {
  const [state, setState] = useState<MatchmakingState>({ status: "idle" });
  const searching = useRef<TimeControl | null>(null);
  const matchedRef = useRef(onMatched);
  useEffect(() => {
    matchedRef.current = onMatched;
  });

  const finish = useCallback((gameId: string) => {
    if (!searching.current) return;
    searching.current = null;
    setState({ status: "matched", gameId });
    matchedRef.current(gameId);
  }, []);

  usePlayerEvents(playerId, finish);

  const send = useCallback(
    async (control: TimeControl) => {
      const result = await api<MatchResponse>("/api/matchmaking", { method: "POST", body: control });
      if (searching.current !== control) return; // cancelled meanwhile
      if (!result.ok) {
        searching.current = null;
        setState({ status: "idle", error: result.error });
        return;
      }
      if (result.status === "matched") finish(result.gameId);
      else if (result.status === "waiting") {
        setState((current) =>
          current.status === "searching" ? current : { status: "searching", control, since: Date.parse(result.since) },
        );
      }
    },
    [finish],
  );

  const start = useCallback(
    (control: TimeControl) => {
      if (searching.current) return; // repeated clicks don't queue twice
      searching.current = control;
      setState({ status: "joining", control });
      void send(control);
    },
    [send],
  );

  const cancel = useCallback(async () => {
    if (!searching.current) return;
    searching.current = null;
    setState({ status: "idle" });
    const result = await api<MatchResponse>("/api/matchmaking", { method: "DELETE" });
    // A match may have landed just before the cancel did.
    if (result.ok && result.status === "matched") {
      searching.current = { initialMs: 0, incrementMs: 0 };
      finish(result.gameId);
    }
  }, [finish]);

  const active = state.status === "searching" ? state.control : null;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void send(active), HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [active, send]);

  // Leaving the page mid-search takes the player out of the queue.
  useEffect(
    () => () => {
      if (searching.current) void api("/api/matchmaking", { method: "DELETE" });
    },
    [],
  );

  return { state, start, cancel };
}
