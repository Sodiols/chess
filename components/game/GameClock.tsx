"use client";

import clsx from "clsx";
import type { Color } from "@/types";
import type { ChessClock } from "@/lib/clock";
import { useClockSnapshot } from "@/hooks/useChessTimer";
import { formatClock } from "@/lib/chess/format";

const LOW_TIME_MS = 20_000;

interface GameClockProps {
  clock: ChessClock;
  color: Color;
}

/**
 * The only component that subscribes to clock ticks, so ten updates a second
 * never reach the board.
 */
export function GameClock({ clock, color }: GameClockProps) {
  const { remaining, running, paused } = useClockSnapshot(clock);
  const time = remaining[color];
  const active = running === color;
  const low = time <= LOW_TIME_MS;

  return (
    <div
      role="timer"
      aria-label={`${color === "w" ? "White" : "Black"} clock`}
      className={clsx(
        "numeric rounded-md px-2.5 py-1 text-lg leading-tight font-semibold tabular-nums transition-colors duration-300 sm:px-3 sm:text-[1.5rem]",
        active && !paused
          ? low
            ? "bg-danger text-[#1a0b09]"
            : "bg-ink text-canvas"
          : "bg-canvas/60 text-faint",
      )}
    >
      {formatClock(time)}
    </div>
  );
}
