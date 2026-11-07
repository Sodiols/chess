"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { usePlayer } from "@/hooks/usePlayer";
import { signOut } from "@/lib/auth/session";
import { loginHref } from "@/lib/auth/validation";

const AUTH_PAGES = ["/login", "/signup", "/forgot-password", "/reset-password", "/auth/callback"];

/** Log in / Sign up when signed out; the player's menu when signed in. */
export function AccountMenu() {
  const { state, auth } = usePlayer();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (auth.status === "unconfigured") return null;
  if (auth.status === "loading") return <span aria-hidden className="h-8 w-16" />;

  if (auth.status !== "signed-in") {
    // Keep the way back to the page they were on, except from an auth page.
    const next = AUTH_PAGES.includes(pathname) ? "/play" : pathname;
    return (
      <div className="flex items-center gap-1.5">
        <Link
          href={loginHref(next)}
          className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-raised hover:text-ink"
        >
          Log in
        </Link>
        <Link
          href={loginHref(next, "signup")}
          className="hidden h-8 items-center rounded-md bg-accent px-3 text-[0.8125rem] font-semibold text-[#1f170a] hover:bg-[#e2b970] sm:inline-flex"
        >
          Sign up
        </Link>
      </div>
    );
  }

  const name = state.status === "ready" ? (state.profile.username ?? "Player") : (auth.user.email?.split("@")[0] ?? "");
  const logout = async () => {
    setLeaving(true);
    await signOut();
    setLeaving(false);
    setOpen(false);
    router.push("/");
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 max-w-44 items-center gap-2 rounded-lg px-1.5 text-sm text-ink transition-colors hover:bg-raised sm:pr-2.5"
      >
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-full border border-accent/50 bg-accent-soft text-xs font-semibold text-accent uppercase"
        >
          {name.slice(0, 1)}
        </span>
        <span className="hidden truncate sm:inline">{name}</span>
        <span className="sr-only sm:hidden">Account: {name}</span>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-30 mt-2 w-52 animate-rise overflow-hidden rounded-lg border border-line bg-surface py-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
        >
          <p className="truncate border-b border-line px-3.5 pt-1 pb-2.5 text-xs text-muted">
            Signed in as <span className="font-medium text-ink">{name}</span>
          </p>
          <MenuLink href="/profile" onSelect={() => setOpen(false)}>
            My Profile
          </MenuLink>
          <MenuLink href="/profile#settings" onSelect={() => setOpen(false)}>
            Settings
          </MenuLink>
          <button
            type="button"
            role="menuitem"
            onClick={() => void logout()}
            disabled={leaving}
            className="block w-full px-3.5 py-2 text-left text-sm text-muted hover:bg-raised hover:text-ink disabled:opacity-50"
          >
            {leaving ? "Logging out…" : "Logout"}
          </button>
        </div>
      )}
    </div>
  );
}

function MenuLink({ href, onSelect, children }: { href: string; onSelect: () => void; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onSelect}
      className={clsx("block px-3.5 py-2 text-sm text-muted hover:bg-raised hover:text-ink")}
    >
      {children}
    </Link>
  );
}
