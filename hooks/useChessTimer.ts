"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { Color, TimeControl } from "@/types";
import { ChessClock, type ClockSnapshot } from "@/lib/clock";

const IDLE: ClockSnapshot = { remaining: { w: 0, b: 0 }, running: null, paused: false };

/**
 * Owns the clock instance for a game. Returns `null` for untimed games so the
 * clock UI can simply not render.
 */
export function useChessTimer(
  timeControl: TimeControl | null,
  onFlag: (color: Color) => void,
): ChessClock | null {
  const onFlagRef = useRef(onFlag);
  useEffect(() => {
    onFlagRef.current = onFlag;
  });

  const clock = useMemo(() => {
    if (!timeControl) return null;
    const instance = new ChessClock(timeControl.initialMs, timeControl.incrementMs);
    instance.onFlag = (color) => onFlagRef.current(color);
    return instance;
  }, [timeControl]);

  useEffect(() => () => clock?.dispose(), [clock]);

  return clock;
}

/**
 * Subscribes a single component to clock ticks. Kept separate from
 * `useChessTimer` so only the two readouts re-render ten times a second.
 */
export function useClockSnapshot(clock: ChessClock | null): ClockSnapshot {
  return useSyncExternalStore(
    clock ? clock.subscribe : noopSubscribe,
    clock ? clock.getSnapshot : getIdle,
    getIdle,
  );
}

function noopSubscribe(): () => void {
  return () => {};
}

function getIdle(): ClockSnapshot {
  return IDLE;
}
