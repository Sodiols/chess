"use client";

import clsx from "clsx";
import type { Color, GameSettings, MaterialBalance } from "@/types";
import type { ChessClock } from "@/lib/clock";
import { CapturedPieces } from "./CapturedPieces";
import { GameClock } from "./GameClock";

interface PlayerPanelProps {
  color: Color;
  name: string;
  active: boolean;
  inCheck: boolean;
  material: MaterialBalance;
  clock: ChessClock | null;
  settings: GameSettings;
}

export function PlayerPanel({
  color,
  name,
  active,
  inCheck,
  material,
  clock,
  settings,
}: PlayerPanelProps) {
  const lead = color === "w" ? material.advantage : -material.advantage;

  return (
    <div
      className={clsx(
        "flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors duration-200",
        active ? "border-line-strong bg-raised" : "border-transparent bg-surface/60",
      )}
    >
      <span
        aria-hidden
        className={clsx(
          "size-2.5 shrink-0 rounded-full ring-1",
          color === "w" ? "bg-[#f2eee6] ring-black/30" : "bg-[#26231f] ring-white/25",
        )}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{name}</span>
          <span className="shrink-0 text-[0.6875rem] text-faint uppercase">
            {color === "w" ? "White" : "Black"}
          </span>
          {inCheck && (
            <span className="shrink-0 rounded-sm bg-danger-soft px-1.5 py-px text-[0.625rem] font-bold tracking-wide text-[#f2a79e] uppercase">
              Check
            </span>
          )}
        </div>

        {settings.showCaptured && (
          <CapturedPieces
            className="mt-1"
            pieces={material.captured[color]}
            capturedColor={color === "w" ? "b" : "w"}
            pieceStyle={settings.pieceStyle}
            lead={lead}
            showLead={settings.showMaterial}
          />
        )}
      </div>

      {active && (
        <span aria-hidden className="h-6 w-px shrink-0 bg-accent/60" />
      )}
      {clock && <GameClock clock={clock} color={color} />}
    </div>
  );
}
