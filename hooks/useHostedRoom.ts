"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/multiplayer/client";
import type { RoomSummary } from "@/lib/multiplayer/types";
import { usePlayerEvents } from "./usePlayerEvents";

/** The room expires two minutes after the last heartbeat. */
const HEARTBEAT_MS = 12_000;

export interface CreateRoomInput {
  name: string;
  password: string;
  initialMs: number;
  incrementMs: number;
  color: "w" | "b" | "random";
  discoverable: boolean;
  ranked: boolean;
  allowSpectators: boolean;
}

export type HostPhase = "restoring" | "idle" | "creating" | "cancelling";

/**
 * A room this player is hosting. The server is the source of truth: on load
 * the hook asks it for the player's open room, so a refresh keeps the room.
 * The plaintext password exists only in this tab's memory from the moment it
 * was typed; after a refresh it can't be shown again (the server has a hash).
 */
export function useHostedRoom(playerId: string, onStarted: (gameId: string) => void) {
  const activity = useRef({ revision: 0, mutating: false });
  const [room, setRoom] = useState<RoomSummary | null>(null);
  /** Null when the room was restored and its password is unknown here. */
  const [password, setPassword] = useState<string | null>(null);
  const [phase, setPhase] = useState<HostPhase>("restoring");
  const [error, setError] = useState<string | null>(null);
  /** The last heartbeat failed to reach the server; the room may lapse. */
  const [unreachable, setUnreachable] = useState(false);
  const startedRef = useRef(onStarted);
  useEffect(() => {
    startedRef.current = onStarted;
  });

  const code = room?.status === "waiting" ? room.code : null;

  const started = useCallback(
    (gameId: string) => {
      if (!code) return;
      setRoom((current) => (current ? { ...current, status: "started", gameId } : current));
      startedRef.current(gameId);
    },
    [code],
  );
  usePlayerEvents(playerId, started);

  /** Applies the server's view of the hosted room. */
  const settle = useCallback((next: RoomSummary) => {
    if (next.status === "started" && next.gameId) {
      setRoom(next);
      startedRef.current(next.gameId);
    } else if (next.status === "waiting") {
      setRoom((current) => current?.status === "started" ? current : next);
    } else {
      setRoom(null);
      setPassword(null);
      setError(next.status === "expired" ? "room_expired" : null);
    }
  }, []);

  // Restore an open room after a refresh or a return to this page.
  useEffect(() => {
    let cancelled = false;
    void api<{ room: RoomSummary | null }>("/api/rooms?mine=1", { expectedUserId: playerId }).then((result) => {
      if (cancelled) return;
      if (result.ok && result.room) settle(result.room);
      else if (!result.ok) setError(result.error);
      setPhase("idle");
    });
    return () => {
      cancelled = true;
    };
  }, [playerId, settle]);

  const create = useCallback(async (input: CreateRoomInput) => {
    if (activity.current.mutating) return;
    activity.current.mutating = true;
    activity.current.revision++;
    setPhase("creating");
    setError(null);
    const result = await api<{ room: RoomSummary }>("/api/rooms", { method: "POST", body: input, expectedUserId: playerId });
    activity.current.mutating = false;
    setPhase("idle");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPassword(input.password);
    setUnreachable(false);
    setRoom(result.room);
  }, [playerId]);

  // The room stays on screen until the server confirms; a failure keeps it
  // (it is still open) and says so, and Cancel can be pressed again.
  const cancel = useCallback(async () => {
    if (!code || activity.current.mutating) return;
    activity.current.mutating = true;
    activity.current.revision++;
    setPhase("cancelling");
    setError(null);
    const result = await api<{ room: RoomSummary }>(`/api/rooms/${code}`, { method: "DELETE", expectedUserId: playerId });
    activity.current.mutating = false;
    setPhase("idle");
    if (result.ok) settle(result.room);
    else if (result.error === "room_not_found") {
      setRoom(null);
      setPassword(null);
    } else {
      setError(result.error);
    }
  }, [code, playerId, settle]);

  // Heartbeat keeps the room listed and catches a missed "game started" event.
  useEffect(() => {
    if (!code) return;
    let closed = false;
    let pending = false;
    const tracker = activity.current;
    const beat = async () => {
      if (closed || pending || tracker.mutating) return;
      pending = true;
      const revision = tracker.revision;
      const result = await api<{ room: RoomSummary }>(`/api/rooms/${code}`, {
        method: "POST",
        body: { action: "heartbeat" },
        expectedUserId: playerId,
      });
      pending = false;
      if (closed || tracker.revision !== revision) return;
      if (result.ok) {
        setUnreachable(false);
        settle(result.room);
      } else if (result.error === "room_not_found") {
        setRoom(null);
        setPassword(null);
        setError("room_closed");
      } else {
        setUnreachable(true);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void beat();
    };
    void beat();
    const timer = setInterval(() => void beat(), HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      closed = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [code, playerId, settle]);

  return { room, password, phase, error, unreachable, create, cancel };
}
