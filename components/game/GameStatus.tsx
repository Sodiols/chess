"use client";

import clsx from "clsx";
import type { Color } from "@/types";
import type { CoachMessage, CoachTone } from "@/lib/chess/coach";

const TONE_STYLES: Record<CoachTone, string> = {
  neutral: "text-muted",
  guide: "text-ink",
  warn: "text-[#e8b57a]",
  alert: "text-[#f2a79e]",
};

interface GameStatusProps {
  turn: Color;
  turnName: string;
  inCheck: boolean;
  doubleCheck: boolean;
  coach: CoachMessage | null;
  paused: boolean;
  /** The computer is choosing its move. */
  thinking?: boolean;
}

/**
 * One line of status under the board. Doubles as the live region that announces
 * turn changes and check to screen readers.
 */
export function GameStatus({
  turn,
  turnName,
  inCheck,
  doubleCheck,
  coach,
  paused,
  thinking = false,
}: GameStatusProps) {
  return (
    <div
      aria-live="polite"
      className="flex min-h-9 items-center gap-2.5 text-[0.8125rem] leading-snug"
    >
      <span
        aria-hidden
        className={clsx(
          "size-2 shrink-0 rounded-full ring-1",
          turn === "w" ? "bg-[#f2eee6] ring-black/30" : "bg-[#26231f] ring-white/30",
        )}
      />

      {thinking ? (
        <p className="flex min-w-0 items-center gap-2 text-muted">
          <span className="text-ink">{turnName}</span> is thinking
          <span aria-hidden className="flex gap-0.5">
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                className="size-1 animate-pulse rounded-full bg-accent"
                style={{ animationDelay: `${dot * 160}ms` }}
              />
            ))}
          </span>
        </p>
      ) : coach ? (
        <p className={clsx("min-w-0", TONE_STYLES[coach.tone])}>{coach.text}</p>
      ) : (
        <p className="min-w-0 text-muted">
          <span className="text-ink">{turnName}</span> to move
          {paused && " — paused"}
          {inCheck && (
            <>
              {" — "}
              <span className="font-semibold text-[#f2a79e]">
                {doubleCheck ? "Double check" : "Check"}
              </span>
            </>
          )}
        </p>
      )}
    </div>
  );
}
