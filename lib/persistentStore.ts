import { loadJson, mergeStored, readRaw, saveJson } from "./storage";

interface PersistentStore<T extends object> {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T;
  getServerSnapshot: () => T;
  update: (patch: Partial<T>) => void;
}

/**
 * Exposes a localStorage entry as an external store for `useSyncExternalStore`.
 *
 * Rendering from a store rather than loading in an effect is what keeps stored
 * preferences out of the server-rendered markup: the server snapshot is always
 * the defaults, so hydration matches, and React re-renders once with the real
 * values. Snapshots are cached against the raw string, so identity stays stable
 * between reads and a change made in another tab is still picked up.
 */
export function createPersistentStore<T extends object>(
  key: string,
  defaults: T,
  normalize: (value: T) => T = (value) => value,
): PersistentStore<T> {
  const listeners = new Set<() => void>();
  const serverSnapshot = normalize(defaults);

  let cachedRaw: string | null = null;
  let cached: T = serverSnapshot;

  function getSnapshot(): T {
    const raw = readRaw(key);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cached = normalize(mergeStored(defaults, loadJson(key)));
    }
    return cached;
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getSnapshot,

    getServerSnapshot() {
      return serverSnapshot;
    },

    update(patch) {
      cached = normalize({ ...getSnapshot(), ...patch });
      saveJson(key, cached);
      cachedRaw = readRaw(key);
      for (const listener of listeners) listener();
    },
  };
}
