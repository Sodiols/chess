"use client";

import clsx from "clsx";
import { useId } from "react";

interface Option<T extends string> {
  value: T;
  label: string;
  /** Optional swatch or icon rendered above the label. */
  visual?: React.ReactNode;
}

interface OptionGroupProps<T extends string> {
  legend: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** `grid` wraps into equal columns; `row` keeps a single scroll-free line. */
  layout?: "grid" | "row";
  columns?: 2 | 3 | 4;
}

/**
 * A segmented control backed by real radio inputs, so arrow-key navigation and
 * screen-reader grouping come from the platform rather than being re-implemented.
 */
export function OptionGroup<T extends string>({
  legend,
  options,
  value,
  onChange,
  layout = "grid",
  columns = 3,
}: OptionGroupProps<T>) {
  const name = useId();

  return (
    <fieldset>
      <legend className="mb-2.5 text-sm font-semibold">{legend}</legend>
      <div
        className={clsx(
          "gap-1.5",
          layout === "grid"
            ? clsx(
                "grid",
                columns === 2 && "grid-cols-2",
                columns === 3 && "grid-cols-3",
                columns === 4 && "grid-cols-4",
              )
            : "flex flex-wrap",
        )}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              className={clsx(
                "press relative flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border px-3 py-2.5 text-center text-sm active:scale-[0.97]",
                "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent",
                selected
                  ? "border-accent bg-accent-soft font-semibold text-ink"
                  : "border-transparent bg-raised text-muted hover:bg-[#282724] hover:text-ink",
              )}
            >
              <input
                type="radio"
                name={name}
                className="sr-only"
                checked={selected}
                onChange={() => onChange(option.value)}
              />
              {option.visual}
              <span className="leading-tight">{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
