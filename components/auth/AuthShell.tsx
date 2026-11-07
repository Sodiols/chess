"use client";

import { useId, useState } from "react";
import clsx from "clsx";
import { Navbar } from "@/components/Navbar";
import { errorMessage } from "@/lib/multiplayer/types";

/** Frame for the account pages: the usual navbar and one centred panel. */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-md px-4 pt-10 pb-16 sm:pt-16">
        <div className="panel animate-rise p-5 sm:p-7">
          <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
          {description && <p className="mt-1.5 text-sm leading-relaxed text-muted">{description}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-5 text-center text-sm text-muted">{footer}</div>}
      </main>
    </>
  );
}

const INPUT =
  "h-10 w-full rounded-lg border bg-raised px-3 text-sm text-ink transition-colors placeholder:text-faint hover:border-line-strong focus:border-accent focus:outline-none";

interface FieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** An error code, shown through `errorMessage`. */
  error?: string | null;
  hint?: React.ReactNode;
}

export function Field({ label, value, onChange, error, hint, type = "text", ...rest }: FieldProps) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";
  const described = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div>
      <label htmlFor={id} className="eyebrow mb-2 block">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && revealed ? "text" : type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          spellCheck={false}
          className={clsx(INPUT, error ? "border-[#8a3d33]" : "border-line", isPassword && "pr-16")}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            aria-pressed={revealed}
            aria-label={revealed ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            className="absolute inset-y-1 right-1 rounded-md px-2.5 text-xs text-muted hover:bg-[#282724] hover:text-ink"
          >
            {revealed ? "Hide" : "Show"}
          </button>
        )}
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-[#f0a49b]">
          {errorMessage(error)}
        </p>
      ) : (
        hint && (
          <div id={`${id}-hint`} className="mt-1.5 text-xs text-faint">
            {hint}
          </div>
        )
      )}
    </div>
  );
}

export function FormAlert({ error, tone = "error" }: { error: string | null; tone?: "error" | "info" }) {
  if (!error) return null;
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={clsx(
        "rounded-lg border px-3 py-2.5 text-sm",
        tone === "error" ? "border-[#5c2f29] bg-danger-soft text-[#f0a49b]" : "border-line bg-raised text-muted",
      )}
    >
      {errorMessage(error)}
    </p>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-sm text-muted" role="status">
      <span aria-hidden className="size-5 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}
    </div>
  );
}
