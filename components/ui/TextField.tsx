"use client";

import { useId } from "react";

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  autoComplete?: string;
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  maxLength = 20,
  autoComplete = "off",
}: TextFieldProps) {
  const id = useId();

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete={autoComplete}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-md border border-line bg-surface px-3.5 text-base sm:text-[0.9375rem] text-ink transition-[border-color,background-color] placeholder:text-faint hover:border-line-strong focus:border-accent focus:bg-raised focus:outline-none"
      />
    </div>
  );
}
