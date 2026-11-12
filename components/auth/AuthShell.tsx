"use client";

import { useId, useState } from "react";
import clsx from "clsx";
import { Navbar } from "@/components/Navbar";
import { errorMessage } from "@/lib/multiplayer/types";
import { OPENINGS, type Opening } from "@/constants/openings";
import { ShowcaseBoard } from "@/components/chess/ShowcaseBoard";

/**
 * Frame for the account pages: the form on the left, and on wide screens a 3D
 * board playing an opening beside it, so every page belongs to the game.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
  opening = OPENINGS.italian,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  opening?: Opening;
}) {
  return (
    <>
      <Navbar />
      <main id="main-content" tabIndex={-1} className="mx-auto grid w-full max-w-[92rem] items-center gap-16 px-4 pt-8 pb-20 sm:px-6 lg:min-h-[calc(100dvh-3.75rem)] lg:grid-cols-[minmax(0,29rem)_minmax(0,1fr)] lg:gap-20 lg:px-8 lg:pt-4 lg:pb-12">
        <div className="mx-auto w-full max-w-md lg:mx-0">
          <h1 className="animate-enter text-[2.25rem] leading-[1.02] font-extrabold sm:text-[2.75rem]">{title}</h1>
          {description && (
            <p className="mt-4 animate-enter text-[1.0625rem] leading-relaxed text-muted" style={{ animationDelay: "60ms" }}>
              {description}
            </p>
          )}
          <div className="mt-8 animate-enter" style={{ animationDelay: "120ms" }}>
            {children}
          </div>
          {footer && (
            <div className="mt-8 animate-enter text-[0.9375rem] text-muted" style={{ animationDelay: "180ms" }}>
              {footer}
            </div>
          )}
        </div>

        <div className="hidden animate-enter lg:block" style={{ animationDelay: "120ms" }}>
          <ShowcaseBoard opening={opening} className="mx-auto max-w-[42rem]" />
        </div>
      </main>
    </>
  );
}

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
      <label htmlFor={id} className="mb-2 block text-sm font-semibold">
        {label}
      </label>
      {/* The box draws the border; input and Show button sit side by side inside it,
          so the button can never drift outside the field. */}
      <div
        className={clsx(
          "flex h-12 w-full min-w-0 items-center rounded-md border bg-surface transition-[border-color,background-color] focus-within:border-accent focus-within:bg-raised hover:border-line-strong",
          error ? "border-[#8a3d33]" : "border-line",
        )}
      >
        <input
          id={id}
          type={isPassword && revealed ? "text" : type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          spellCheck={false}
          className="h-full w-full min-w-0 flex-1 rounded-md bg-transparent px-3.5 text-base text-ink placeholder:text-faint focus:outline-none sm:text-[0.9375rem]"
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            aria-pressed={revealed}
            aria-label={revealed ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            className="press mr-1.5 h-9 shrink-0 rounded px-3 text-[0.8125rem] font-medium text-muted hover:bg-[#282724] hover:text-ink"
          >
            {revealed ? "Hide" : "Show"}
          </button>
        )}
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-2 animate-rise text-[0.8125rem] text-[#f4aaa1]">
          {errorMessage(error)}
        </p>
      ) : (
        hint && (
          <div id={`${id}-hint`} className="mt-2 text-[0.8125rem] text-faint">
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
        "animate-rise rounded-md px-4 py-3 text-sm",
        tone === "error" ? "bg-danger-soft text-[#f4aaa1]" : "bg-raised text-muted",
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
