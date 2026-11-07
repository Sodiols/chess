"use client";

import { useEffect, useId, useRef } from "react";
import clsx from "clsx";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** When false, Escape and backdrop clicks are ignored. */
  dismissible?: boolean;
  size?: "sm" | "md";
  /** `bottom` renders a mobile sheet; `center` is the default modal. */
  placement?: "center" | "bottom";
  children: React.ReactNode;
}

/**
 * Built on the native dialog element, which supplies the focus trap, Escape
 * handling and `aria-modal` semantics without a third-party library.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  dismissible = true,
  size = "sm",
  placement = "center",
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(event) => {
        if (dismissible && event.target === ref.current) onClose();
      }}
      className={clsx(
        "bg-transparent p-0 text-ink backdrop:animate-fade",
        placement === "bottom"
          ? "mx-auto mt-auto mb-0 w-full max-w-[36rem]"
          : clsx("m-auto w-[calc(100vw-2rem)]", size === "sm" ? "max-w-[26rem]" : "max-w-[34rem]"),
      )}
    >
      {open && (
        <div
          className={clsx(
            "border border-line bg-surface p-5 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)] sm:p-6",
            placement === "bottom"
              ? "animate-slide-up rounded-t-2xl pb-[max(1.25rem,env(safe-area-inset-bottom))]"
              : "animate-rise rounded-lg",
          )}
        >
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="mt-1.5 text-sm leading-relaxed text-muted">
              {description}
            </p>
          )}
          <div className="mt-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}
