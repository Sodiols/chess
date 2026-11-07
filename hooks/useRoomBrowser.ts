"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/multiplayer/client";
import type { RoomSummary } from "@/lib/multiplayer/types";
import { getBrowserClient } from "@/lib/supabase/browser";

export function isOpen(room: RoomSummary, now = Date.now()): boolean {
  return room.status === "waiting" && room.discoverable && room.players === 1 && Date.parse(room.expiresAt) > now;
}

/**
 * Applies one live change to the list. A room already shown keeps its slot; a
 * new one lands at a random position, so the order stays shuffled without the
 * list reshuffling under the reader's cursor.
 */
export function mergeRoom(rooms: RoomSummary[], room: RoomSummary, random = Math.random): RoomSummary[] {
  const index = rooms.findIndex((existing) => existing.code === room.code);
  if (!isOpen(room)) return index === -1 ? rooms : rooms.filter((existing) => existing.code !== room.code);
  if (index !== -1) return rooms.map((existing, at) => (at === index ? room : existing));
  const at = Math.floor(random() * (rooms.length + 1));
  return [...rooms.slice(0, at), room, ...rooms.slice(at)];
}

/**
 * Folds a fresh server list into what's on screen: rooms still open keep their
 * place (with updated details), closed ones go, new ones land at random spots.
 * A refresh — including the automatic one after reconnecting — never reshuffles
 * the list under the reader.
 */
export function reconcileRooms(current: RoomSummary[], fresh: RoomSummary[], random = Math.random): RoomSummary[] {
  const byCode = new Map(fresh.map((room) => [room.code, room]));
  const kept = current.flatMap((room) => {
    const latest = byCode.get(room.code);
    return latest && isOpen(latest) ? [latest] : [];
  });
  const shown = new Set(kept.map((room) => room.code));
  return fresh.filter((room) => !shown.has(room.code)).reduce((list, room) => mergeRoom(list, room, random), kept);
}

export type LiveStatus = "connecting" | "live" | "offline";

type BrowserState =
  | { status: "loading"; rooms: RoomSummary[] }
  | { status: "ready"; rooms: RoomSummary[] }
  | { status: "error"; rooms: RoomSummary[]; error: string };

/** Discoverable waiting rooms, kept current over the `rooms` Realtime topic. */
export function useRoomBrowser(enabled: boolean) {
  const [state, setState] = useState<BrowserState>({ status: "loading", rooms: [] });
  const [live, setLive] = useState<LiveStatus>("connecting");

  const refresh = useCallback(async () => {
    setState((current) => ({ status: "loading", rooms: current.rooms }));
    // The server returns them in random order.
    const result = await api<{ rooms: RoomSummary[] }>("/api/rooms");
    setState((current) =>
      result.ok
        ? { status: "ready", rooms: reconcileRooms(current.rooms, result.rooms) }
        : { status: "error", rooms: current.rooms, error: result.error },
    );
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const supabase = getBrowserClient();
    let cancelled = false;
    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;

    void (async () => {
      await refresh();
      if (!supabase) return;
      try {
        await supabase.realtime.setAuth();
      } catch {
        if (!cancelled) setLive("offline");
        return;
      }
      if (cancelled) return;
      channel = supabase
        .channel("rooms", { config: { private: true } })
        .on("broadcast", { event: "room_changed" }, ({ payload }) => {
          const room = (payload as { room?: RoomSummary }).room;
          if (room) setState((current) => ({ ...current, rooms: mergeRoom(current.rooms, room) }));
        })
        .subscribe((status) => {
          setLive(status === "SUBSCRIBED" ? "live" : status === "CLOSED" ? "connecting" : "offline");
          // Anything missed while disconnected is picked up by a fresh list.
          if (status === "SUBSCRIBED") void refresh();
        });
    })();

    // Rooms whose host stopped heart-beating age out without any event.
    const prune = setInterval(() => {
      setState((current) => {
        const open = current.rooms.filter((room) => isOpen(room));
        return open.length === current.rooms.length ? current : { ...current, rooms: open };
      });
    }, 15_000);

    return () => {
      cancelled = true;
      clearInterval(prune);
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [enabled, refresh]);

  return { ...state, live, refresh };
}
