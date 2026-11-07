import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

let admin: SupabaseClient | null = null;

/**
 * Privileged client for route handlers only. The secret key is not a
 * NEXT_PUBLIC_ variable, so it is never inlined into a browser bundle.
 */
export function getAdminClient(): SupabaseClient | null {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!SUPABASE_URL || !secret) return null;
  admin ??= createClient(SUPABASE_URL, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

/**
 * Verifies the caller's access token and returns who they are. `getClaims`
 * checks the signature locally against the project's JWKS when asymmetric keys
 * are enabled, and falls back to asking the Auth server otherwise.
 */
export async function getCaller(
  request: Request,
  client: SupabaseClient,
): Promise<{ id: string; anonymous: boolean } | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  const { data, error } = await client.auth.getClaims(token);
  if (error || !data) return null;
  const { sub, role, is_anonymous } = data.claims;
  if (role !== "authenticated" || typeof sub !== "string") return null;
  return { id: sub, anonymous: is_anonymous === true };
}
