"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !root.current?.contains(event.target as Node)) {
        setOpen(false);
        if (event instanceof KeyboardEvent) trigger.current?.focus();
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
  if (auth.status === "loading") return <span aria-hidden className="h-11 w-16" />;

  if (auth.status !== "signed-in") {
    // Keep the way back to the page they were on, except from an auth page.
    const next = AUTH_PAGES.includes(pathname) ? "/play" : pathname;
    return (
      <div className="flex shrink-0 items-center gap-1">
        <Link
          href={loginHref(next)}
          className="inline-flex min-h-11 items-center px-2 text-sm font-semibold whitespace-nowrap text-muted hover:text-ink sm:px-3"
        >
          Log in
        </Link>
        <Link
          href={loginHref(next, "signup")}
          className="inline-flex min-h-11 items-center bg-accent px-2.5 text-sm font-bold whitespace-nowrap text-[#1f170a] hover:bg-[#e2b970] sm:px-3"
        >
          Sign up
        </Link>
      </div>
    );
  }

  const name = state.status === "ready" ? (state.profile.username ?? "Player") : (auth.user.email?.split("@")[0] ?? "Player");
  const logout = async () => {
    setLeaving(true);
    await signOut();
    setLeaving(false);
    setOpen(false);
    router.push("/");
  };

  return (
    <div
      ref={root}
      className="relative min-w-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        ref={trigger}
        aria-label={`Account, ${name}`}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 max-w-36 items-center px-2 text-sm font-semibold text-ink hover:bg-raised sm:px-3"
      >
        <span className="sm:hidden">Account</span>
        <span className="hidden truncate sm:inline">{name}</span>
      </button>

      {open && (
        <div
          id={menuId}
          className="absolute right-0 z-30 mt-1 w-52 bg-raised py-1"
        >
          <p className="truncate px-3.5 py-2 text-sm text-muted">
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
            onClick={() => void logout()}
            disabled={leaving}
            className="block min-h-11 w-full px-3.5 text-left text-sm text-muted hover:bg-surface hover:text-ink disabled:opacity-50"
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
      onClick={onSelect}
      className="flex min-h-11 items-center px-3.5 text-sm text-muted hover:bg-surface hover:text-ink"
    >
      {children}
    </Link>
  );
}
