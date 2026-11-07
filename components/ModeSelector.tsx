"use client";

import clsx from "clsx";
import type { AssistanceMode } from "@/types";
import { MODE_DETAILS, MODE_ORDER } from "@/constants/assistance";
import { MiniBoard } from "@/components/chess/MiniBoard";

/** 1.e4 e5 2.Nf3 Nc6, with the knight on f3 picked up: the same moment in every mode. */
const SAMPLE_FEN = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
const SAMPLE: Record<AssistanceMode, { from?: "f3"; marks: ("f3" | "e5")[]; label: string }> = {
  beginner: { from: "f3", marks: ["e5"], label: "Knight on f3 with every move dotted and the pawn it can take on e5 marked" },
  medium: { from: "f3", marks: [], label: "Knight on f3 with its legal moves dotted" },
  pro: { marks: ["f3"], label: "Knight on f3 selected with no moves shown" },
};

interface ModeSelectorProps {
  value?: AssistanceMode;
  onSelect: (mode: AssistanceMode) => void;
  /** `card` is the landing layout; `compact` is the setup screen row. */
  layout?: "card" | "compact";
}

export function ModeSelector({ value, onSelect, layout = "card" }: ModeSelectorProps) {
  return (
    <ul
      className={clsx(
        "grid gap-3",
        layout === "card" ? "sm:grid-cols-3 sm:gap-5" : "grid-cols-3 gap-2",
      )}
    >
      {MODE_ORDER.map((mode, index) => {
        const details = MODE_DETAILS[mode];
        const selected = value === mode;

        return (
          <li key={mode}>
            <button
              type="button"
              onClick={() => onSelect(mode)}
              aria-pressed={value ? selected : undefined}
              className={clsx(
                "press group flex h-full w-full flex-col items-start rounded-lg text-left active:scale-[0.98]",
                layout === "card" ? "bg-raised p-4 hover:bg-[#262522] sm:p-5" : "gap-1 border p-3",
                layout === "compact" &&
                  (selected
                    ? "border-accent bg-accent-soft/60"
                    : "border-transparent bg-raised hover:bg-[#282724]"),
              )}
            >
              {layout === "card" && (
                <div className="mb-5 w-full transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-1.5">
                  <MiniBoard
                    fen={SAMPLE_FEN}
                    from={SAMPLE[mode].from}
                    marks={SAMPLE[mode].marks}
                    label={SAMPLE[mode].label}
                  />
                </div>
              )}

              <div className="flex w-full items-center justify-between gap-2">
                <span className={clsx("font-bold", layout === "card" && "text-xl")}>{details.name}</span>
                <AssistanceMeter level={3 - index} active={selected} />
              </div>

              <span
                className={clsx(
                  layout === "card" ? "mt-1 text-base" : "mt-0 text-[0.8125rem]",
                  selected ? "text-ink" : "text-muted",
                )}
              >
                {details.tagline}
              </span>

              {layout === "card" && (
                <>
                  <ul className="mt-4 space-y-1.5 text-sm text-muted">
                    {details.points.map((point) => (
                      <li key={point} className="flex gap-2">
                        <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-accent" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Three bars filled to show how much help the mode gives. */
function AssistanceMeter({ level, active }: { level: number; active: boolean }) {
  return (
    <span aria-hidden className="flex items-end gap-[3px]">
      {[1, 2, 3].map((step) => (
        <span
          key={step}
          className={clsx(
            "w-[3px] rounded-full transition-colors",
            step === 1 && "h-2",
            step === 2 && "h-3",
            step === 3 && "h-4",
            step <= level ? (active ? "bg-accent" : "bg-muted") : "bg-line-strong",
          )}
        />
      ))}
    </span>
  );
}
