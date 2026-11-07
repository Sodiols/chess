"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { accountId, useAuth } from "@/lib/auth/session";
import { api } from "@/lib/multiplayer/client";
import {
  DEFAULT_SECRET_SETTINGS,
  sanitizeSecretSettings,
  type SecretSettings,
} from "@/lib/secret/settings";

/** What the server said about one account. `settings` is null for everyone but the owner. */
interface OwnerState {
  userId: string;
  settings: SecretSettings | null;
}

let state: OwnerState | null = null;
let checking: string | null = null;
const listeners = new Set<() => void>();

function emit(next: OwnerState | null) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function check(userId: string) {
  if (checking === userId || state?.userId === userId) return;
  checking = userId;
  void api<{ owner: boolean; settings?: unknown }>("/api/owner").then((result) => {
    // Signed out or switched account while the request was in flight.
    if (checking !== userId) return;
    checking = null;
    emit({ userId, settings: result.ok && result.owner ? sanitizeSecretSettings(result.settings) : null });
  });
}

/**
 * Secret Mode for the verified owner. The server decides who that is; this hook
 * only mirrors its answer for the account signed in right now, so signing out or
 * switching accounts hides everything on the very next render.
 */
export function useSecretMode(): {
  isOwner: boolean;
  settings: SecretSettings;
  update: (patch: Partial<SecretSettings>) => void;
} {
  const userId = accountId(useAuth());
  const snapshot = useSyncExternalStore(subscribe, () => state, () => null);

  useEffect(() => {
    if (userId) {
      check(userId);
    } else {
      checking = null;
      if (state) emit(null);
    }
  }, [userId]);

  const current = snapshot && snapshot.userId === userId ? snapshot.settings : null;

  const update = useCallback(
    (patch: Partial<SecretSettings>) => {
      if (!state?.settings || state.userId !== userId) return;
      const owner = state.userId;
      const previous = state.settings;
      const next = { ...previous, ...patch };
      emit({ userId: owner, settings: next });
      void api<{ settings?: unknown }>("/api/owner", { method: "POST", body: { settings: next } }).then((result) => {
        if (state?.userId !== owner) return;
        // A refused save (e.g. lost owner status) is rolled back rather than left showing as saved.
        if (!result.ok) emit({ userId: owner, settings: result.error === "not_owner" ? null : previous });
      });
    },
    [userId],
  );

  return { isOwner: current !== null, settings: current ?? DEFAULT_SECRET_SETTINGS, update };
}
