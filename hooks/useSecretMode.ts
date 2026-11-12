"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/auth/session";
import { api } from "@/lib/multiplayer/client";
import { DEFAULT_SECRET_SETTINGS, sanitizeSecretSettings, type SecretSettings } from "@/lib/secret/settings";

type Status = "loading" | "owner" | "not_owner" | "unavailable" | "migration_missing";
type OwnerState = {
  userId: string;
  status: Status;
  settings?: SecretSettings;
  saving?: boolean;
  refreshing?: boolean;
  saveError?: string;
};

let state: OwnerState | null = null;
let identity: { userId: string; token: string } | null = null;
let checking = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retries = 0;
let checkedAt = 0;
const listeners = new Set<() => void>();

function emit(next: OwnerState | null) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function check(force = false) {
  const account = identity;
  if (!account || checking || state?.saving || (!force && Date.now() - checkedAt < 60_000)) return;
  clearTimeout(retryTimer);
  checking = true;
  if (!state || state.userId !== account.userId || state.status === "unavailable" || state.status === "migration_missing") emit({ userId: account.userId, status: "loading" });
  else if (state.status === "owner") emit({ ...state, refreshing: true });
  void api<{ owner: boolean; settings?: unknown }>("/api/owner", { expectedUserId: account.userId }).then((result) => {
    if (identity !== account) return;
    checking = false;
    checkedAt = Date.now();
    if (!result.ok) {
      const status = result.error === "setup_incomplete" ? "migration_missing" : "unavailable";
      emit({ userId: account.userId, status });
      if (process.env.NODE_ENV === "development") console.info("[gambit coach] owner verification", status, result.error);
      if (status === "unavailable" && ["timeout", "network", "try_again", "auth_unavailable"].includes(result.error) && retries < 2) {
        retryTimer = setTimeout(() => check(true), [2000, 8000][retries++]);
      }
      return;
    }
    retries = 0;
    emit(result.owner
      ? { userId: account.userId, status: "owner", settings: sanitizeSecretSettings(result.settings) }
      : { userId: account.userId, status: "not_owner" });
  });
}

function identify(userId: string | null, token: string | null) {
  if (identity?.userId === userId && identity?.token === token) return;
  clearTimeout(retryTimer);
  checking = false;
  retries = 0;
  checkedAt = 0;
  const sameAccount = identity?.userId === userId;
  identity = userId && token ? { userId, token } : null;
  if (!sameAccount) emit(null);
  else if (state?.saving) {
    // Let an already submitted write finish before re-reading this account.
    return;
  }
  check(true);
}

export function useSecretMode() {
  const auth = useAuth();
  const userId = auth.status === "signed-in" ? auth.user.id : null;
  const token = auth.status === "signed-in" ? auth.session.access_token : null;
  const snapshot = useSyncExternalStore(subscribe, () => state, () => null);

  useEffect(() => {
    identify(userId, token);
    if (!userId) return;
    const reconnect = () => check(true);
    const focus = () => check();
    window.addEventListener("online", reconnect);
    window.addEventListener("focus", focus);
    return () => {
      window.removeEventListener("online", reconnect);
      window.removeEventListener("focus", focus);
    };
  }, [userId, token]);

  const retry = useCallback(() => {
    retries = 0;
    check(true);
  }, []);

  const update = useCallback((patch: Partial<SecretSettings>) => {
    const account = identity;
    const previous = state;
    if (!account || account.userId !== userId || checking || !previous?.settings || previous.saving || previous.userId !== userId) return;
    const submitted = { ...previous, saving: true, saveError: undefined };
    const settings = { ...previous.settings, ...patch };
    emit(submitted);
    void api<{ owner: boolean; settings?: unknown }>("/api/owner", {
      method: "POST", body: { settings }, expectedUserId: account.userId,
    }).then((result) => {
      if (state !== submitted || identity?.userId !== account.userId) return;
      if (result.ok && result.owner) {
        emit({ userId: account.userId, status: "owner", settings: sanitizeSecretSettings(result.settings) });
      } else if (!result.ok && ["not_owner", "signed_out", "setup_incomplete"].includes(result.error)) {
        emit({ userId: account.userId, status: result.error === "not_owner" ? "not_owner" : result.error === "setup_incomplete" ? "migration_missing" : "unavailable" });
      } else {
        emit({ ...previous, saving: false, saveError: result.ok ? "try_again" : result.error });
      }
      if (identity !== account) check(true);
    });
  }, [userId]);

  const current = snapshot?.userId === userId ? snapshot : null;
  const status = current?.status ?? (userId || auth.status === "loading" ? "loading" : "not_owner");
  return { isOwner: status === "owner", status, settings: current?.settings ?? DEFAULT_SECRET_SETTINGS,
    saving: current?.saving ?? false, refreshing: current?.refreshing ?? false, saveError: current?.saveError, retry, update };
}
