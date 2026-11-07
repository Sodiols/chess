"use client";

import clsx from "clsx";
import type { Color, GameSettings, MaterialBalance } from "@/types";
import type { ChessClock } from "@/lib/clock";
import { ChessPiece } from "@/components/chess/ChessPiece";
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
        "flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors duration-300",
        active ? "bg-raised" : "bg-surface/60",
      )}
    >
      <span
        aria-hidden
        className={clsx(
          "size-8 shrink-0 transition-[opacity,transform] duration-300",
          active ? "opacity-100" : "scale-90 opacity-50",
        )}
      >
        <ChessPiece piece={{ color, type: "k" }} style={settings.pieceStyle} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={clsx("truncate text-[0.9375rem] font-bold", active ? "text-ink" : "text-muted")}>
            {name}
          </span>
          <span className="shrink-0 text-[0.8125rem] text-faint">{color === "w" ? "White" : "Black"}</span>
          {inCheck && (
            <span className="shrink-0 animate-rise rounded-sm bg-danger-soft px-1.5 py-px text-xs font-bold text-[#f4aaa1]">
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

      {clock && <GameClock clock={clock} color={color} />}
    </div>
  );
}
