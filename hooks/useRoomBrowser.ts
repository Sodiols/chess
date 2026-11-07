"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ensureSession } from "@/lib/multiplayer/client";
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

type BrowserState =
  | { status: "loading"; rooms: RoomSummary[] }
  | { status: "ready"; rooms: RoomSummary[] }
  | { status: "error"; rooms: RoomSummary[]; error: string };

/** Discoverable waiting rooms, kept current over the `rooms` Realtime topic. */
export function useRoomBrowser(enabled: boolean) {
  const [state, setState] = useState<BrowserState>({ status: "loading", rooms: [] });
  const [live, setLive] = useState(false);

  const refresh = useCallback(async () => {
    setState((current) => ({ status: "loading", rooms: current.rooms }));
    // The server returns them in random order.
    const result = await api<{ rooms: RoomSummary[] }>("/api/rooms");
    setState((current) =>
      result.ok
        ? { status: "ready", rooms: result.rooms.filter((room) => isOpen(room)) }
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
      await ensureSession();
      await supabase.realtime.setAuth();
      if (cancelled) return;
      channel = supabase
        .channel("rooms", { config: { private: true } })
        .on("broadcast", { event: "room_changed" }, ({ payload }) => {
          const room = (payload as { room?: RoomSummary }).room;
          if (room) setState((current) => ({ ...current, rooms: mergeRoom(current.rooms, room) }));
        })
        .subscribe((status) => {
          setLive(status === "SUBSCRIBED");
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
