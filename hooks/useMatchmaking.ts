"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TimeControl } from "@/types";
import { api } from "@/lib/multiplayer/client";
import type { Profile } from "@/lib/multiplayer/types";
import { usePlayerEvents } from "./usePlayerEvents";

export const MATCHMAKING_LIMIT_MS = 30_000;

type MatchResponse = { status: "waiting" } | { status: "matched"; gameId: string } | { status: "idle" };

export type MatchmakingState =
  | { status: "idle"; error?: string; timedOut?: boolean; cancelling?: boolean }
  | { status: "joining"; control: TimeControl; since: number }
  | { status: "searching"; control: TimeControl; since: number }
  | { status: "matched"; gameId: string };

type Attempt = {
  join: Promise<Awaited<ReturnType<typeof api<MatchResponse>>>>;
  deadline: number;
  timer: ReturnType<typeof setTimeout>;
  stopping: boolean;
};

export function useMatchmaking(playerId: string | null, onMatched: (gameId: string) => void) {
  const [state, setState] = useState<MatchmakingState>({ status: "idle" });
  const current = useRef<Attempt | null>(null);
  const matchedRef = useRef(onMatched);
  useEffect(() => {
    matchedRef.current = onMatched;
  });

  const finish = useCallback((gameId: string) => {
    const attempt = current.current;
    if (!attempt) return;
    clearTimeout(attempt.timer);
    current.current = null;
    setState({ status: "matched", gameId });
    matchedRef.current(gameId);
  }, []);

  usePlayerEvents(playerId, finish);

  const cancel = useCallback(async (timedOut = false) => {
    const attempt = current.current;
    if (!attempt || attempt.stopping) return;
    attempt.stopping = true;
    clearTimeout(attempt.timer);
    setState({ status: "idle", timedOut, cancelling: true });
    // Order the delete after the original join so a slow join can't recreate the entry.
    await attempt.join;
    const result = await api<MatchResponse>("/api/matchmaking", { method: "DELETE" });
    if (current.current !== attempt) return;
    if (result.ok && result.status === "matched") {
      finish(result.gameId);
      return;
    }
    current.current = null;
    setState({ status: "idle", timedOut, error: !result.ok && !timedOut ? result.error : undefined });
  }, [finish]);

  const start = useCallback((control: TimeControl) => {
    if (current.current) return;
    const since = Date.now();
    const attempt: Attempt = {
      join: api<MatchResponse>("/api/matchmaking", { method: "POST", body: control }),
      deadline: since + MATCHMAKING_LIMIT_MS,
      timer: setTimeout(() => void cancel(true), MATCHMAKING_LIMIT_MS),
      stopping: false,
    };
    current.current = attempt;
    setState({ status: "joining", control, since });

    void attempt.join.then((result) => {
      if (current.current !== attempt || attempt.stopping) return;
      if (result.ok && result.status === "matched") {
        finish(result.gameId);
      } else if (result.ok) {
        setState({ status: "searching", control, since });
      } else {
        clearTimeout(attempt.timer);
        current.current = null;
        setState({ status: "idle", error: result.error });
      }
    });
  }, [cancel, finish]);

  useEffect(() => {
    if (state.status !== "searching") return;
    // Recover a match if its Realtime notification was missed, without renewing the queue.
    const poll = async () => {
      const attempt = current.current;
      if (!attempt || attempt.stopping) return;
      if (Date.now() >= attempt.deadline) {
        void cancel(true);
        return;
      }
      const result = await api<{ profile: Profile }>("/api/profile");
      if (current.current === attempt && result.ok && result.profile.activeGameId) {
        finish(result.profile.activeGameId);
      }
    };
    const timer = setInterval(poll, 4000);
    return () => clearInterval(timer);
  }, [cancel, finish, state.status]);

  useEffect(() => () => {
    const attempt = current.current;
    current.current = null;
    if (!attempt || attempt.stopping) return;
    clearTimeout(attempt.timer);
    void attempt.join.then(() => api("/api/matchmaking", { method: "DELETE" }));
  }, []);

  return { state, start, cancel };
}
