"use client";

import type { Session } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase/browser";

export type ApiResult<T> = ({ ok: true } & T) | { ok: false; error: string };

let sessionPromise: Promise<Session | null> | null = null;

/**
 * Returns the guest session, signing in anonymously the first time. Concurrent
 * callers share one sign-in, so a page that mounts several hooks still creates
 * exactly one identity.
 */
export function ensureSession(): Promise<Session | null> {
  const supabase = getBrowserClient();
  if (!supabase) return Promise.resolve(null);

  sessionPromise ??= (async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session;
    const signIn = await supabase.auth.signInAnonymously();
    if (signIn.error) throw signIn.error;
    return signIn.data.session;
  })().finally(() => {
    sessionPromise = null;
  });
  return sessionPromise;
}

/** An expired or revoked session: try a refresh, else start a new guest. */
async function recoverSession(): Promise<Session | null> {
  const supabase = getBrowserClient();
  if (!supabase) return null;
  const refreshed = await supabase.auth.refreshSession();
  if (refreshed.data.session) return refreshed.data.session;
  await supabase.auth.signOut({ scope: "local" });
  return ensureSession();
}

/** Calls a Gambit API route as the current guest. Never throws. */
export async function api<T extends object = object>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  let session: Session | null;
  try {
    session = await ensureSession();
  } catch (error) {
    // Supabase reports this when anonymous sign-ins are switched off.
    const code = (error as { code?: string }).code;
    return { ok: false, error: code === "anonymous_provider_disabled" ? "guest_disabled" : "network" };
  }
  if (!session) return { ok: false, error: "not_configured" };

  const send = (token: string) =>
    fetch(path, {
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });

  try {
    let response = await send(session.access_token);
    if (response.status === 401) {
      const recovered = await recoverSession();
      if (!recovered) return { ok: false, error: "unauthorized" };
      response = await send(recovered.access_token);
    }
    const payload = (await response.json()) as ApiResult<T>;
    return payload && typeof payload === "object" ? payload : { ok: false, error: "try_again" };
  } catch {
    return { ok: false, error: "network" };
  }
}
