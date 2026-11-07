"use client";

import type { Session } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase/browser";

export type ApiResult<T> = ({ ok: true } & T) | { ok: false; error: string };

const TIMEOUT_MS = 15_000;

/**
 * The current session, refreshed if its access token expired. Never signs
 * anyone in: online play needs a real account, created on /signup.
 */
export async function currentSession(): Promise<Session | null> {
  const supabase = getBrowserClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/** Calls a Gambit API route as the signed-in player. Never throws. */
export async function api<T extends object = object>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const supabase = getBrowserClient();
  if (!supabase) return { ok: false, error: "not_configured" };

  let session: Session | null;
  try {
    session = await currentSession();
  } catch {
    return { ok: false, error: "network" };
  }
  if (!session) return { ok: false, error: "signed_out" };

  const send = (token: string) =>
    fetch(path, {
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  try {
    let response = await send(session.access_token);
    if (response.status === 401) {
      // The token was revoked or expired early; one refresh, then give up.
      // Failing here signs nobody in and creates no account.
      const { data } = await supabase.auth.refreshSession();
      if (!data.session) return { ok: false, error: "signed_out" };
      response = await send(data.session.access_token);
      if (response.status === 401) return { ok: false, error: "signed_out" };
    }
    const payload = (await response.json()) as ApiResult<T> & { debug?: string };
    if (process.env.NODE_ENV === "development" && !payload.ok) {
      console.warn(`[gambit] ${init.method ?? "GET"} ${path} → ${payload.error}`, {
        requestId: response.headers.get("x-request-id"),
        debug: payload.debug,
      });
    }
    return payload && typeof payload === "object" ? payload : { ok: false, error: "try_again" };
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return { ok: false, error: timedOut ? "timeout" : "network" };
  }
}
