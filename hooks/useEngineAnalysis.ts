"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AnalysisStrength } from "@/lib/secret/settings";
import { StockfishClient, engineSupported, type EngineUpdate } from "@/lib/secret/stockfish";

const noSubscribe = () => () => {};

/** Finished searches, so stepping back through a game does not recalculate. Keyed by fen + strength. */
const finished = new Map<string, EngineUpdate>();
const CACHE_LIMIT = 300;

export function cachedAnalysis(fen: string, strength: AnalysisStrength): EngineUpdate | undefined {
  return finished.get(`${strength} ${fen}`);
}

/**
 * Live Stockfish analysis of `fen`. The worker loads only once `enabled` is
 * true and is freed when it turns false; `search` pauses without unloading it
 * (e.g. while an online move awaits the server). A new position discards the
 * old search, and anything reported for a different position is never returned.
 */
export function useEngineAnalysis(fen: string, enabled: boolean, search: boolean, strength: AnalysisStrength) {
  const active = enabled && search;
  const engine = useRef<StockfishClient | null>(null);
  const [update, setUpdate] = useState<{ key: string; run: number; value: EngineUpdate } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  const key = `${strength} ${fen}`;
  const cached = finished.get(key);

  useEffect(() => {
    if (!active || cached || error || !engineSupported()) return;
    const fail = (message: string) => {
      engine.current = null;
      setError(message);
    };
    let cancelled = false;
    let cancel: (() => void) | undefined;
    const start = setTimeout(() => {
      if (cancelled) return;
      try {
        engine.current ??= new StockfishClient(fail);
        cancel = engine.current.analyze(fen, strength, (value) => {
          if (value.done && value.lines.length > 0) {
            if (finished.size >= CACHE_LIMIT) finished.delete(finished.keys().next().value!);
            finished.set(key, value);
          }
          setUpdate({ key, run, value });
        });
      } catch {
        fail("The browser could not start the analysis worker. Check that the engine assets are available.");
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(start);
      cancel?.();
    };
  }, [active, cached, error, fen, key, strength, run]);

  useEffect(() => {
    if (!enabled) return;
    return () => {
      engine.current?.dispose();
      engine.current = null;
    };
  }, [enabled]);

  const stop = useCallback(() => engine.current?.stop(), []);
  const rerun = useCallback(() => {
    finished.delete(key);
    if (error) {
      engine.current?.dispose();
      engine.current = null;
    }
    setError(null);
    setRun((n) => n + 1);
  }, [error, key]);

  const current = cached ?? (update?.key === key && update.run === run ? update.value : null);
  // Read after hydration only (the server snapshot says "supported"), so server and client HTML match.
  const supported = useSyncExternalStore(noSubscribe, engineSupported, () => true);
  const problem = supported ? error : "This browser cannot run the analysis engine (Web Workers are unavailable).";
  return { analysis: active ? current : null, error: enabled ? problem : null, stop, rerun };
}
