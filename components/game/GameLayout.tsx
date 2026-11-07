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
}: GameLayoutProps) {
  return (
    <div className="mx-auto w-full max-w-[92rem] px-3 pb-4 sm:px-5 lg:px-8">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
        {/* Board column */}
        <div className="flex flex-col gap-2.5">
          <div className="lg:hidden">{top}</div>

          {/* Width is bounded by the remaining viewport height, so the square board
              always fits vertically without a media query. */}
          <div className="mx-auto w-full max-w-[min(100%,max(17rem,calc(100dvh-19rem)))] lg:max-w-[min(48rem,calc(100dvh-11rem))]">
            {board}
          </div>

          <div className="lg:hidden">{bottom}</div>

          {status}

          <div className="lg:hidden">{controls(true)}</div>
        </div>

        {/* Side panel — desktop only; phones use the drawer instead. */}
        <aside className="panel hidden max-h-[calc(100dvh-7rem)] flex-col overflow-hidden lg:flex">
          <header className="flex items-baseline justify-between gap-2 border-b border-line px-3 py-2.5">
            <span className="truncate text-sm font-semibold">{title}</span>
            <span className="numeric shrink-0 text-[0.6875rem] text-faint">{subtitle}</span>
          </header>

          <div className="p-2">{top}</div>

          {showMoveHistory ? (
            <MoveHistory history={history} className="min-h-32 flex-1 border-y border-line py-1" />
          ) : (
            <div className="flex-1 border-y border-line" />
          )}

          <div className="p-2">{bottom}</div>

          <div className="border-t border-line p-2">{controls(false)}</div>
        </aside>
      </div>
    </div>
  );
}
