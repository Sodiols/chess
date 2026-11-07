"use client";

import Link from "next/link";
import { useState } from "react";
import clsx from "clsx";
import { useGameSettings } from "@/hooks/useGameSettings";
import { SettingsDialog } from "@/components/game/SettingsDialog";
import { GearIcon } from "@/components/ui/icons";
import { Wordmark } from "./Wordmark";
import { AccountMenu } from "./AccountMenu";

interface NavbarProps {
  /** The game screen uses a slimmer bar without the section links. */
  variant?: "full" | "game";
}

export function Navbar({ variant = "full" }: NavbarProps) {
  const { settings, updateSettings } = useGameSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <header
      className={clsx(
        "sticky top-0 z-20 border-b border-line/80 bg-canvas/85 backdrop-blur-md",
        variant === "game" ? "h-13" : "h-15",
      )}
    >
      <nav
        aria-label="Main"
        className="mx-auto flex h-full max-w-[92rem] items-center gap-3 px-3 sm:gap-6 sm:px-5 lg:px-8"
      >
        <Link href="/" className="shrink-0 rounded" aria-label="Gambit home">
          <Wordmark />
        </Link>

        {variant === "full" && (
          <div className="ml-auto flex items-center gap-1">
            <NavLink href="/play">Play</NavLink>
            <NavLink href="/how-to-play" className="hidden sm:inline-block">
              How to play
            </NavLink>
          </div>
        )}

        <div className={clsx("flex items-center gap-1", variant === "game" && "ml-auto")}>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Game settings"
            className="flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-ink"
          >
            <GearIcon />
          </button>
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

function NavLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={clsx("rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-raised hover:text-ink", className)}
    >
      {children}
    </Link>
  );
}
