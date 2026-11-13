"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import { useGameSettings } from "@/hooks/useGameSettings";
import { SettingsDialog } from "@/components/game/SettingsDialog";
import { NotificationBell } from "@/components/social/NotificationBell";
import { AccountMenu } from "./AccountMenu";

interface NavbarProps {
  variant?: "full" | "game";
}

const navControl = "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap px-2 text-sm font-semibold text-muted hover:text-ink sm:px-3";

export function Navbar({ variant = "full" }: NavbarProps) {
  const { settings, updateSettings } = useGameSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pathname = usePathname();
  const full = variant === "full";

  return (
    <header className={clsx("relative z-20 bg-surface", full ? "sm:sticky sm:top-0" : "sticky top-0")}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-4 focus:z-40 focus:bg-accent focus:px-4 focus:py-2 focus:text-canvas"
      >
        Skip to content
      </a>
      <nav
        aria-label="Main"
        className={clsx(
          "mx-auto grid max-w-[92rem] items-center px-4 sm:px-6 lg:px-8",
          full
            ? "grid-cols-[auto_1fr] gap-x-2 pt-1 pb-0.5 sm:min-h-16 lg:grid-cols-[minmax(0,1fr)_auto_minmax(max-content,1fr)] lg:gap-x-6 lg:py-0"
            : "min-h-13 grid-cols-[auto_1fr] gap-x-2",
        )}
      >
        <Link
          href="/"
          translate="no"
          aria-label="Gambit home"
          className="inline-flex min-h-11 w-fit items-center text-[1.375rem] leading-none font-extrabold tracking-tight text-ink hover:text-accent sm:text-2xl"
        >
          Gambit
        </Link>

        {full && (
          <div className="flex flex-wrap items-center justify-end sm:gap-2">
            <NavLink href="/play" pathname={pathname}>Play</NavLink>
            <NavLink href="/leaderboard" pathname={pathname}>Leaderboard</NavLink>
            <NavLink href="/spectate" pathname={pathname}>Spectate</NavLink>
            <NavLink href="/friends" pathname={pathname}>Friends</NavLink>
            <span className="hidden xl:inline-flex"><NavLink href="/how-to-play" pathname={pathname}>How to Play</NavLink></span>
          </div>
        )}

        <div className={clsx("flex min-w-0 items-center justify-end sm:gap-1", full && "col-span-2 max-lg:justify-between lg:col-span-1")}>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Game settings"
            aria-haspopup="dialog"
            className={clsx(navControl, full && "max-lg:pl-0")}
          >
            Settings
          </button>
          <NotificationBell />
          <AccountMenu />
        </div>
      </nav>

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onChange={updateSettings}
        onClose={() => setSettingsOpen(false)}
        context="global"
      />
    </header>
  );
}

function NavLink({ href, pathname, children }: { href: string; pathname: string; children: React.ReactNode }) {
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={pathname === href ? "page" : active ? "location" : undefined}
      className={clsx(navControl, "max-sm:px-1.5", active && "underline decoration-accent decoration-2 underline-offset-8")}
    >
      {children}
    </Link>
  );
}
