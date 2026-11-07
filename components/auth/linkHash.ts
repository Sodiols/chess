"use client";

import { useSyncExternalStore } from "react";
import { linkError } from "@/lib/auth/errors";

// Captured when this module first loads, before Supabase reads (and clears)
// the tokens in the fragment: an email link always arrives as a full page load.
const initialHash = typeof window === "undefined" ? "" : window.location.hash;
const noop = () => () => {};

/** The error an email link's fragment carries (expired, reused, invalid), if any. */
export function useLinkError(): string | null {
  const hash = useSyncExternalStore(noop, () => initialHash, () => "");
  return linkError(hash);
}
