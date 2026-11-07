"use client";

import { useSyncExternalStore } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase/browser";
import { isOnlineConfigured } from "@/lib/supabase/config";

/**
 * Who is signed in, from the one Supabase browser client.
 *
 * Session strategy: the session lives in localStorage (supabase-js handles
 * refresh and survives browser restarts), and API routes receive the access
 * token as a bearer header. No page renders private data on the server, so
 * cookie-based SSR sessions would add a second session store without
 * protecting anything more; one strategy is used throughout.
 */
export type AuthState =
  | { status: "unconfigured" }
  | { status: "loading" }
  | { status: "signed-out" }
  /** A guest identity from the old automatic sign-in. Can be upgraded to an account. */
  | { status: "anonymous"; user: User; session: Session }
  | { status: "signed-in"; user: User; session: Session };

const SERVER_STATE: AuthState = isOnlineConfigured ? { status: "loading" } : { status: "unconfigured" };

let state: AuthState = SERVER_STATE;
let started = false;
const listeners = new Set<() => void>();

function fromSession(session: Session | null): AuthState {
  if (!session) return { status: "signed-out" };
  return session.user.is_anonymous
    ? { status: "anonymous", user: session.user, session }
    : { status: "signed-in", user: session.user, session };
}

function start() {
  if (started) return;
  const supabase = getBrowserClient();
  if (!supabase) return;
  started = true;
  // Fires INITIAL_SESSION once the stored session (or a link's tokens) is read,
  // then on every sign-in, refresh, sign-out and change made in another tab.
  supabase.auth.onAuthStateChange((_event, session) => {
    const previousId = "user" in state ? state.user.id : null;
    state = fromSession(session);
    const nextId = "user" in state ? state.user.id : null;
    // A different person (or nobody) now: drop every live channel of the old one.
    if (previousId && previousId !== nextId) void supabase.removeAllChannels();
    for (const listener of listeners) listener();
  });
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
}

/** The signed-in user's id, or null (anonymous guests count as signed out here). */
export function accountId(auth: AuthState): string | null {
  return auth.status === "signed-in" ? auth.user.id : null;
}

export async function signOut(): Promise<void> {
  const supabase = getBrowserClient();
  if (!supabase) return;
  await supabase.auth.signOut({ scope: "local" });
}

/** Absolute URL on this site, for links Supabase puts in emails. */
export function siteUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}
