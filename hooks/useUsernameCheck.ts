"use client";

import { useEffect, useState } from "react";
import { validateUsername } from "@/lib/auth/validation";

export type UsernameCheck =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available" }
  | { status: "unavailable"; reason: string }
  | { status: "error"; error: string };

/** Asks the server whether a name is free. Advisory: the database decides on save. */
export async function checkUsername(name: string): Promise<UsernameCheck> {
  try {
    const response = await fetch(`/api/username?name=${encodeURIComponent(name)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json()) as { ok: boolean; available?: boolean; reason?: string; error?: string };
    if (!body.ok) return { status: "error", error: body.error ?? "try_again" };
    return body.available ? { status: "available" } : { status: "unavailable", reason: body.reason ?? "username_taken" };
  } catch {
    return { status: "error", error: "network" };
  }
}

/** Debounced availability of `name`; `current` (your own name) counts as available. */
export function useUsernameCheck(name: string, current?: string | null): UsernameCheck {
  const [result, setResult] = useState<{ name: string; check: UsernameCheck } | null>(null);
  const isOwn = Boolean(current) && current!.toLowerCase() === name.toLowerCase();
  const checkable = !isOwn && validateUsername(name) === null;

  useEffect(() => {
    if (!checkable) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void checkUsername(name).then((check) => {
        if (!cancelled) setResult({ name, check });
      });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [checkable, name]);

  if (isOwn) return { status: "available" };
  if (!checkable) return { status: "idle" };
  return result?.name === name ? result.check : { status: "checking" };
}
