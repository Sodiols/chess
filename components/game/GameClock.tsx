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
        "numeric rounded-md px-2.5 py-1 text-[1.0625rem] leading-tight font-medium tabular-nums transition-colors duration-200 sm:text-xl",
        active && !paused
          ? low
            ? "bg-danger-soft text-[#f2a79e]"
            : "bg-raised text-ink"
          : "text-faint",
        low && "font-semibold",
      )}
    >
      {formatClock(time)}
    </div>
  );
}
