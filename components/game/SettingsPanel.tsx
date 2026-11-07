"use client";

import type { BoardThemeId, GameSettings, PieceStyleId } from "@/types";
import { BOARD_THEMES, PIECE_STYLES } from "@/constants/board";
import { OptionGroup } from "@/components/ui/OptionGroup";
import { Toggle } from "@/components/ui/Toggle";
import { ChessPiece } from "@/components/chess/ChessPiece";

interface SettingsPanelProps {
  settings: GameSettings;
  onChange: (patch: Partial<GameSettings>) => void;
  /** Hides in-game-only options on the standalone settings surface. */
  context?: "game" | "global";
}

export function SettingsPanel({ settings, onChange, context = "game" }: SettingsPanelProps) {
  return (
    <div className="space-y-6">
      <OptionGroup<BoardThemeId>
        legend="Board theme"
        columns={4}
        value={settings.boardTheme}
        onChange={(boardTheme) => onChange({ boardTheme })}
        options={BOARD_THEMES.map((theme) => ({
          value: theme.id,
          label: theme.name,
          visual: (
            <span aria-hidden className="grid size-7 grid-cols-2 grid-rows-2 overflow-hidden rounded">
              <span style={{ background: theme.light }} />
              <span style={{ background: theme.dark }} />
              <span style={{ background: theme.dark }} />
              <span style={{ background: theme.light }} />
            </span>
          ),
        }))}
      />

      <OptionGroup<PieceStyleId>
        legend="Piece style"
        columns={2}
        value={settings.pieceStyle}
        onChange={(pieceStyle) => onChange({ pieceStyle })}
        options={PIECE_STYLES.map((style) => ({
          value: style.id,
          label: style.name,
          visual: (
            <span aria-hidden className="flex items-end gap-0.5">
              <span className="block size-7">
                <ChessPiece piece={{ color: "w", type: "n" }} style={style.id} />
              </span>
              <span className="block size-7">
                <ChessPiece piece={{ color: "b", type: "q" }} style={style.id} />
              </span>
            </span>
          ),
        }))}
      />

      <div className="divide-y divide-line border-y border-line">
        <Toggle
          label="Sound"
          hint="Short cues for moves, captures and check."
          checked={settings.sound}
          onChange={(sound) => onChange({ sound })}
        />
        <Toggle
          label="Board coordinates"
          checked={settings.coordinates}
          onChange={(coordinates) => onChange({ coordinates })}
        />
        <Toggle
          label="Move animations"
          checked={settings.animations}
          onChange={(animations) => onChange({ animations })}
        />
        <Toggle
          label="Captured pieces"
          checked={settings.showCaptured}
          onChange={(showCaptured) => onChange({ showCaptured })}
        />
        <Toggle
          label="Material count"
          hint="Informational only."
          checked={settings.showMaterial}
          disabled={!settings.showCaptured}
          onChange={(showMaterial) => onChange({ showMaterial })}
        />
        <Toggle
          label="Move history"
          checked={settings.showMoveHistory}
          onChange={(showMoveHistory) => onChange({ showMoveHistory })}
        />
        {context === "game" && (
          <Toggle
            label="Allow undo"
            hint="Takes back the last move, including clocks."
            checked={settings.allowUndo}
            onChange={(allowUndo) => onChange({ allowUndo })}
          />
        )}
      </div>
    </div>
  );
}
