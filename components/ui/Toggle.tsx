"use client";

import clsx from "clsx";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, hint, disabled }: ToggleProps) {
  return (
    <label
      className={clsx(
        "flex items-center justify-between gap-4 py-2.5",
        disabled ? "opacity-45" : "cursor-pointer",
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-xs leading-snug text-faint">{hint}</span>}
      </span>

      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        aria-hidden
        className={clsx(
          "relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-150",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
          checked ? "bg-accent" : "bg-line-strong",
        )}
      >
        <span
          className={clsx(
            "absolute top-[3px] size-4 rounded-full bg-white transition-[left] duration-150",
            checked ? "left-[19px]" : "left-[3px]",
          )}
        />
      </span>
    </label>
  );
}
