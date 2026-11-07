const PREFIX = "gambit:";

export const STORAGE_KEYS = {
  settings: "settings",
  setup: "setup",
  onboarded: "onboarded",
  online: "online",
} as const;

/** Raw stored string, used as a cheap change token by the persistent stores. */
export function readRaw(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function loadJson(key: string): unknown {
  const raw = readRaw(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    // Corrupted values fall back to defaults rather than breaking the page.
    return null;
  }
}

export function saveJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Preferences are a convenience — never let a failed write break the game.
  }
}

/**
 * Merges stored values over defaults, keeping only known keys whose stored type
 * still matches. Guards against stale shapes left by an earlier version.
 */
export function mergeStored<T extends object>(defaults: T, stored: unknown): T {
  if (!stored || typeof stored !== "object") return defaults;
  const result = { ...defaults };

  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const value = (stored as Record<string, unknown>)[key as string];
    if (value !== undefined && typeof value === typeof defaults[key]) {
      result[key] = value as T[keyof T];
    }
  }

  return result;
}
