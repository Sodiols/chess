"use client";

import { useEffect, useRef } from "react";
import { useSocialQuery } from "@/hooks/useSocialQuery";
import { useAuth } from "@/lib/auth/session";
import { api } from "@/lib/multiplayer/client";
import { getBrowserClient } from "@/lib/supabase/browser";

export function useActivity(activity: "online" | "local" | "computer" | "spectating" | null, presenceTopic: string | null = null) {
  const auth = useAuth();
  const user = auth.status === "signed-in" ? auth.user.id : null;
  const token = auth.status === "signed-in" ? auth.session.access_token : null;
  useEffect(() => {
    if (!user || !activity || !token) return;
    const id = crypto.randomUUID();
    const heartbeat = () => void api("/api/social/activity", { method: "POST", body: { id, activity } });
    const supabase = getBrowserClient();
    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;
    let closed = false;
    if (supabase && presenceTopic) void supabase.realtime.setAuth().then(() => {
      if (closed) return;
      channel = supabase.channel(presenceTopic, { config: { private: true, presence: { key: id } } })
        .subscribe((status) => { if (status === "SUBSCRIBED") void channel?.track({ connected: true }); });
    }).catch(() => {});
    const leave = () => {
      void fetch("/api/social/activity", {
        method: "POST", keepalive: true,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ id, activity: null }),
      }).catch(() => {});
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, 12_000);
    window.addEventListener("online", heartbeat);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", heartbeat);
    return () => {
      closed = true;
      window.clearInterval(timer);
      window.removeEventListener("online", heartbeat);
      if (channel) void supabase?.removeChannel(channel);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", heartbeat);
      leave();
    };
  }, [activity, presenceTopic, token, user]);
}

export function PlayerActivity() {
  const { result, refresh } = useSocialQuery<{ presenceTopic: string | null; settings: { show_activity: boolean } }>("/api/social/settings", { interval: 30_000 });
  const visible = result?.ok && result.settings.show_activity;
  useActivity(visible ? "online" : null, result?.ok ? result.presenceTopic : null);
  useEffect(() => {
    window.addEventListener("gambit-social-update", refresh);
    return () => window.removeEventListener("gambit-social-update", refresh);
  }, [refresh]);
  return null;
}

export function useFriendPresence(key: string, onChange: () => void) {
  const callback = useRef(onChange);
  useEffect(() => { callback.current = onChange; }, [onChange]);
  useEffect(() => {
    const supabase = getBrowserClient();
    if (!key || !supabase) return;
    let closed = false;
    let timer: ReturnType<typeof setTimeout>;
    const channels: ReturnType<typeof supabase.channel>[] = [];
    void supabase.realtime.setAuth().then(() => {
      if (closed) return;
      for (const topic of key.split(",")) {
        channels.push(supabase.channel(topic, { config: { private: true } })
          .on("presence", { event: "sync" }, () => {
            clearTimeout(timer);
            timer = setTimeout(() => callback.current(), 750);
          }).subscribe());
      }
    }).catch(() => {});
    return () => {
      closed = true;
      clearTimeout(timer);
      for (const channel of channels) void supabase.removeChannel(channel);
    };
  }, [key]);
}
