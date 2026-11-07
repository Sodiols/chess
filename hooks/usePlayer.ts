"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/multiplayer/client";
import type { Profile } from "@/lib/multiplayer/types";
import { isOnlineConfigured } from "@/lib/supabase/config";

export type PlayerState =
  | { status: "unconfigured" }
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; profile: Profile };

/**
 * The signed-in guest. Signs in anonymously on first use; the session persists
 * across refreshes and is shared by tabs, so one browser is one player.
 */
export function usePlayer() {
  const [state, setState] = useState<PlayerState>(
    isOnlineConfigured ? { status: "loading" } : { status: "unconfigured" },
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isOnlineConfigured) return;
    let cancelled = false;
    void api<{ profile: Profile }>("/api/profile").then((result) => {
      if (cancelled) return;
      setState(result.ok ? { status: "ready", profile: result.profile } : { status: "error", error: result.error });
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  /** Returns an error code, or null on success. */
  const rename = useCallback(async (nickname: string): Promise<string | null> => {
    const result = await api<{ profile: Profile }>("/api/profile", { method: "POST", body: { nickname } });
    if (!result.ok) return result.error;
    setState({ status: "ready", profile: result.profile });
    return null;
  }, []);

  return { state, rename, retry };
}
