"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { AnalysisStrength } from "@/lib/secret/settings";
import { StockfishClient, engineSupported, type EngineUpdate } from "@/lib/secret/stockfish";

let engine: StockfishClient | null = null;
let engineError: string | null = null;
const errorListeners = new Set<(message: string) => void>();

function getEngine(): StockfishClient | null {
  if (!engineSupported()) return null;
  engine ??= new StockfishClient((message) => {
    engineError = message;
    engine?.dispose();
    engine = null;
    for (const listener of errorListeners) listener(message);
  });
  return engine;
}

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
  const [update, setUpdate] = useState<EngineUpdate | null>(null);
  const [error, setError] = useState<string | null>(engineError);
  const [run, setRun] = useState(0);
  const key = `${strength} ${fen}`;
  const cached = finished.get(key);

  useEffect(() => {
    if (!active || cached) return;
    const client = getEngine();
    if (!client) return;
    errorListeners.add(setError);
    const cancel = client.analyze(fen, strength, (next) => {
      if (next.done && next.lines.length > 0) {
        if (finished.size >= CACHE_LIMIT) finished.delete(finished.keys().next().value!);
        finished.set(`${strength} ${next.fen}`, next);
      }
      setUpdate(next);
    });
    return () => {
      cancel();
      errorListeners.delete(setError);
    };
  }, [active, cached, fen, strength, run]);

  // Turning Secret Mode off (or leaving the board) frees the worker and its memory.
  useEffect(() => {
    if (!enabled) return;
    return () => {
      engine?.dispose();
      engine = null;
    };
  }, [enabled]);

  const stop = useCallback(() => engine?.stop(), []);
  /** Searches the current position again, ignoring any finished result. */
  const rerun = useCallback(() => {
    finished.delete(key);
    engineError = null;
    setError(null);
    setRun((n) => n + 1);
  }, [key]);

  const current = cached ?? (update && update.fen === fen ? update : null);
  // Read after hydration only (the server snapshot says "supported"), so server and client HTML match.
  const supported = useSyncExternalStore(noSubscribe, engineSupported, () => true);
  const problem = supported ? error : "This browser cannot run the analysis engine (Web Workers are unavailable).";
  return { analysis: active ? current : null, error: enabled ? problem : null, stop, rerun };
}
