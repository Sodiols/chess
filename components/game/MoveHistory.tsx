"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";
import type { PlayedMove } from "@/types";
import { toMovePairs } from "@/lib/chess/format";

interface MoveHistoryProps {
  history: PlayedMove[];
  className?: string;
}

/**
 * Read-only scoresheet. Rows are deliberately not clickable: browsing history
 * must never be able to alter the live position.
 */
export function MoveHistory({ history, className }: MoveHistoryProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pairs = toMovePairs(history);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [history.length]);

  return (
    <div className={clsx("flex min-h-0 flex-col", className)}>
      {/* Focusable so the scoresheet can be scrolled from the keyboard. */}
      <div
        ref={scrollRef}
        role="region"
        aria-label="Move history"
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1"
      >
        {pairs.length === 0 ? (
          <p className="px-2 py-3 text-[0.8125rem] text-muted">No moves yet. White moves first.</p>
        ) : (
          <ol className="numeric text-sm">
            {pairs.map((pair) => (
              <li
                key={pair.number}
                className="grid animate-fade grid-cols-[3ch_1fr_1fr] items-baseline gap-3 rounded px-2 py-1"
              >
                <span className="text-right text-faint">{pair.number}</span>
                <span className="text-ink">{pair.white?.san ?? ""}</span>
                <span className="text-ink">{pair.black?.san ?? ""}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
