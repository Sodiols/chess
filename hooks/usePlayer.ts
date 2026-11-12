"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api } from "@/lib/multiplayer/client";
import type { Profile } from "@/lib/multiplayer/types";
import { useAuth } from "@/lib/auth/session";

type Entry =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; profile: Profile };

export type PlayerState =
  | { status: "unconfigured" }
  | { status: "signed-out" }
  | { status: "anonymous" }
  | Entry;

/**
 * One profile cache for the whole tab, keyed by account. When the account
 * changes, the old entry is discarded before anything reads it, so one
 * player's profile can never show under another's session.
 */
let cache: { userId: string | null; entry: Entry } = { userId: null, entry: { status: "loading" } };
let inFlight: { userId: string } | null = null;
const listeners = new Set<() => void>();

function set(userId: string, entry: Entry) {
  cache = { userId, entry };
  for (const listener of listeners) listener();
}

async function load(userId: string, force: boolean) {
  if (inFlight?.userId === userId) return;
  if (!force && cache.userId === userId && cache.entry.status === "ready") return;
  if (cache.userId !== userId || cache.entry.status === "error") set(userId, { status: "loading" });
  const request = { userId };
  inFlight = request;
  const result = await api<{ profile: Profile }>("/api/profile", { expectedUserId: userId });
  if (inFlight !== request) return;
  inFlight = null;
  if (!result.ok && cache.userId === userId && cache.entry.status === "ready"
    && ["network", "timeout", "auth_unavailable", "try_again"].includes(result.error)) return;
  if (cache.userId !== userId) return; // signed out or switched meanwhile
  set(userId, result.ok ? { status: "ready", profile: result.profile } : { status: "error", error: result.error });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/**
 * The signed-in player's profile. `revalidate` refetches on mount (online
 * lobbies need a fresh `activeGameId`); the navbar uses the cached copy.
 */
export function usePlayer({ revalidate = false }: { revalidate?: boolean } = {}) {
  const auth = useAuth();
  const userId = auth.status === "signed-in" || auth.status === "anonymous" ? auth.user.id : null;
  const token = auth.status === "signed-in" || auth.status === "anonymous" ? auth.session.access_token : null;
  const snapshot = useSyncExternalStore(subscribe, () => cache, () => cache);

  useEffect(() => {
    if (userId && token) void load(userId, revalidate);
    else if (auth.status === "signed-out" && cache.userId) {
      inFlight = null;
      cache = { userId: null, entry: { status: "loading" } };
      for (const listener of listeners) listener();
    }
  }, [auth.status, userId, token, revalidate]);

  const retry = useCallback(() => {
    if (userId) void load(userId, true);
  }, [userId]);

  /** Returns an error code, or null on success. */
  const setUsername = useCallback(
    async (username: string): Promise<string | null> => {
      if (!userId) return "signed_out";
      const result = await api<{ profile: Profile }>("/api/profile", { method: "POST", body: { username }, expectedUserId: userId });
      if (!result.ok) return result.error;
      if (cache.userId === userId) set(userId, { status: "ready", profile: result.profile });
      return null;
    },
    [userId],
  );

  let state: PlayerState;
  if (auth.status === "unconfigured" || auth.status === "signed-out") state = { status: auth.status };
  else if (auth.status === "loading" || !userId) state = { status: "loading" };
  else if (auth.status === "anonymous") state = { status: "anonymous" };
  else state = snapshot.userId === userId ? snapshot.entry : { status: "loading" };

  return { state, auth, retry, setUsername };
}
