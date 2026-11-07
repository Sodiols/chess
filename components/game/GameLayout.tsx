"use client";

import type { PlayedMove } from "@/types";
import { MoveHistory } from "./MoveHistory";

interface GameLayoutProps {
  title: string;
  subtitle: string;
  top: React.ReactNode;
  bottom: React.ReactNode;
  board: React.ReactNode;
  /** Lines under the board: turn status, connection banners. */
  status: React.ReactNode;
  /** Rendered twice: `withDetails` is the phone row that opens the drawer. */
  controls: (withDetails: boolean) => React.ReactNode;
  history: PlayedMove[];
  showMoveHistory: boolean;
  /** Owner-only engine panel: under the controls on phones, above the history on desktop. */
  coach?: React.ReactNode;
}

/** Board column plus the desktop side panel, shared by every game mode. */
export function GameLayout({
  title,
  subtitle,
  top,
  bottom,
  board,
  status,
  controls,
  history,
  showMoveHistory,
  coach,
}: GameLayoutProps) {
  return (
    <div className="mx-auto w-full max-w-[92rem] px-3 pt-2 pb-6 sm:px-6 lg:px-8 lg:pt-4">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-10">
        {/* Board column */}
        <div className="flex flex-col gap-2.5">
          <div className="lg:hidden">{top}</div>

          {/* Width is bounded by the remaining viewport height (players, status,
              controls and the 3D rim's extra depth), so the board and controls fit. */}
          <div className="mx-auto w-full max-w-[min(100%,max(17rem,calc(100dvh-23rem)))] lg:max-w-[min(48rem,calc(100dvh-11rem))]">
            {board}
          </div>

          <div className="lg:hidden">{bottom}</div>

          {status}

          <div className="lg:hidden">{controls(true)}</div>

          {coach && <div className="lg:hidden">{coach}</div>}
        </div>

        {/* Side panel — desktop only; phones use the drawer instead. */}
        <aside className="hidden max-h-[calc(100dvh-7rem)] animate-rise flex-col overflow-hidden rounded-lg bg-surface lg:flex">
          <header className="flex items-baseline justify-between gap-2 px-4 pt-4 pb-2">
            <span className="truncate text-base font-bold">{title}</span>
            <span className="numeric shrink-0 text-xs text-muted">{subtitle}</span>
          </header>

          <div className="p-2">{top}</div>

          {coach && <div className="max-h-[45%] shrink-0 overflow-y-auto px-2 pb-2">{coach}</div>}

          {showMoveHistory ? (
            <MoveHistory history={history} className="mx-2 min-h-32 flex-1 rounded-md bg-canvas/50 py-1.5" />
          ) : (
            <div className="flex-1" />
          )}

          <div className="p-2">{bottom}</div>

          <div className="p-2 pt-1">{controls(false)}</div>
        </aside>
      </div>
    </div>
  );
}
