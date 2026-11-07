/** Public settings, safe in the browser bundle. Both must be set for online play. */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export const isOnlineConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

/** Seconds an opponent may be gone before the board says they disconnected. */
export const DISCONNECT_GRACE_MS =
  Math.max(0, Number(process.env.NEXT_PUBLIC_DISCONNECT_GRACE_SECONDS ?? 8) || 8) * 1000;
