"use client";

import clsx from "clsx";
import type { AssistanceMode } from "@/types";
import { MODE_DETAILS, MODE_ORDER } from "@/constants/assistance";

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
        layout === "card" ? "sm:grid-cols-3 sm:gap-4" : "grid-cols-3 gap-2",
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
                "group flex h-full w-full flex-col items-start rounded-xl border text-left transition-colors duration-150",
                layout === "card" ? "p-4 sm:p-5" : "gap-1 p-3",
                selected
                  ? "border-accent bg-accent-soft/60"
                  : "border-line bg-surface hover:border-line-strong hover:bg-raised",
              )}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="font-semibold">{details.name}</span>
                <AssistanceMeter level={3 - index} active={selected} />
              </div>

              <span
                className={clsx(
                  "text-[0.8125rem]",
                  layout === "card" ? "mt-1.5" : "mt-0",
                  selected ? "text-ink" : "text-muted",
                )}
              >
                {details.tagline}
              </span>

              {layout === "card" && (
                <>
                  <span className="mt-0.5 text-xs text-faint">{details.summary}</span>
                  <ul className="mt-4 space-y-1.5 border-t border-line pt-3 text-xs text-muted">
                    {details.points.map((point) => (
                      <li key={point} className="flex gap-2">
                        <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-faint" />
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
