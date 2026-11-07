"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/multiplayer/client";
import type { RoomSummary } from "@/lib/multiplayer/types";
import { usePlayerEvents } from "./usePlayerEvents";

/** The room expires two minutes after the last heartbeat. */
const HEARTBEAT_MS = 30_000;

export interface CreateRoomInput {
  name: string;
  password: string;
  initialMs: number;
  incrementMs: number;
  color: "w" | "b" | "random";
  discoverable: boolean;
}

/**
 * A room this player is hosting. The plaintext password is kept only in memory
 * for this session, so the host can copy the invite; the server stores a hash.
 */
export function useHostedRoom(playerId: string | null, onStarted: (gameId: string) => void) {
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

  const create = useCallback(async (input: CreateRoomInput) => {
    setBusy(true);
    setError(null);
    const result = await api<{ room: RoomSummary }>("/api/rooms", { method: "POST", body: input });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPassword(input.password);
    setRoom(result.room);
  }, []);

  const cancel = useCallback(async () => {
    if (!code) return;
    setRoom(null);
    setPassword("");
    await api(`/api/rooms/${code}`, { method: "DELETE" });
  }, [code]);

  // Heartbeat keeps the room listed and catches a missed "game started" event.
  useEffect(() => {
    if (!code) return;
    const beat = async () => {
      const result = await api<{ room: RoomSummary }>(`/api/rooms/${code}`, {
        method: "POST",
        body: { action: "heartbeat" },
      });
      if (!result.ok) return;
      if (result.room.status === "started" && result.room.gameId) started(result.room.gameId);
      else if (result.room.status !== "waiting") setRoom(result.room);
    };
    const timer = setInterval(() => void beat(), HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [code, started]);

  return { room, password, error, busy, create, cancel };
}
