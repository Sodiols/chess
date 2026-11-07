"use client";

import type { Color, GameSettings, MaterialBalance, PlayedMove } from "@/types";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { CapturedPieces } from "./CapturedPieces";
import { MoveHistory } from "./MoveHistory";

interface MobileGameDrawerProps {
  open: boolean;
  onClose: () => void;
  history: PlayedMove[];
  material: MaterialBalance;
  players: Record<Color, string>;
  settings: GameSettings;
}

/**
 * On phones the scoresheet and captured material move into a sheet so the board
 * keeps the full screen width instead of being squeezed by a side panel.
 */
export function MobileGameDrawer({
  open,
  onClose,
  history,
  material,
  players,
  settings,
}: MobileGameDrawerProps) {
  return (
    <Dialog open={open} onClose={onClose} placement="bottom" title="Game details">
      {settings.showCaptured && (
        <div className="mb-4 space-y-2.5 border-b border-line pb-4">
          {(["w", "b"] as Color[]).map((color) => (
            <div key={color} className="flex items-center gap-3">
              <span className="w-24 shrink-0 truncate text-xs text-muted">{players[color]}</span>
              <CapturedPieces
                pieces={material.captured[color]}
                capturedColor={color === "w" ? "b" : "w"}
                pieceStyle={settings.pieceStyle}
                lead={color === "w" ? material.advantage : -material.advantage}
                showLead={settings.showMaterial}
              />
            </div>
          ))}
        </div>
      )}

      {settings.showMoveHistory && (
        <>
          <p className="eyebrow mb-1.5">Moves</p>
          <MoveHistory history={history} className="h-56" />
        </>
      )}

      <Button variant="secondary" block className="mt-4" onClick={onClose}>
        Close
      </Button>
    </Dialog>
  );
}
