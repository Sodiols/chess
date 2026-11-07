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
      <label htmlFor={id} className="eyebrow mb-2 block">
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
        className="h-10 w-full rounded-lg border border-line bg-raised px-3 text-sm text-ink transition-colors placeholder:text-faint hover:border-line-strong focus:border-accent focus:outline-none"
      />
    </div>
  );
}
