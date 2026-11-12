"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ApiResult } from "@/lib/multiplayer/client";
import { useAuth } from "@/lib/auth/session";
import { getBrowserClient } from "@/lib/supabase/browser";

export async function publicSocial<T extends object>(path: string): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    return await response.json();
  } catch {
    return { ok: false, error: "network" };
  }
}

export function useSocialQuery<T extends object>(path: string | null, options: { public?: boolean; interval?: number } = {}) {
  const [result, setResult] = useState<{ path: string; response: ApiResult<T> } | null>(null);
  const auth = useAuth();
  const isPublic = options.public;
  const user = auth.status === "signed-in" ? auth.user.id : null;
  const key = path && (isPublic || user) ? `${isPublic ? "public" : user}:${path}` : null;
  const interval = options.interval;
  const request = useRef({ sequence: 0 });
  const refresh = useCallback(async () => {
    if (!path || !key) return;
    const revision = ++request.current.sequence;
    const response = await (isPublic ? publicSocial<T>(path) : api<T>(path));
    if (revision === request.current.sequence) setResult({ path: key, response });
  }, [isPublic, key, path]);

  useEffect(() => {
    const tracker = request.current;
    void refresh();
    const timer = interval && key ? window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, interval) : null;
    return () => {
      tracker.sequence++;
      if (timer) clearInterval(timer);
    };
  }, [interval, key, refresh]);
  return { result: result?.path === key ? result.response : null, refresh };
}

export function useSocialBroadcast(topic: string | null, event: string, onUpdate: () => void) {
  const callback = useRef(onUpdate);
  useEffect(() => { callback.current = onUpdate; }, [onUpdate]);
  useEffect(() => {
    const supabase = getBrowserClient();
    if (!topic || !supabase) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void supabase.realtime.setAuth().then(() => {
      if (cancelled) return;
      channel = supabase.channel(topic, { config: { private: true } })
        .on("broadcast", { event }, () => callback.current())
        .subscribe((status) => { if (status === "SUBSCRIBED") callback.current(); });
    }).catch(() => {});
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [event, topic]);
}
