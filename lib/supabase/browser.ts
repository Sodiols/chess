"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, isOnlineConfigured } from "./config";

let client: SupabaseClient | null = null;

/**
 * One client per tab. Its session lives in localStorage, so a refresh keeps the
 * same account signed in (and survives browser restarts); all tabs share it.
 */
export function getBrowserClient(): SupabaseClient | null {
  if (!isOnlineConfigured || typeof window === "undefined") return null;
  client ??= createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "gambit:auth" },
  });
  return client;
}
