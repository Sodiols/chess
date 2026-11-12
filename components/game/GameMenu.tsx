"use client";

import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

interface GameMenuProps {
  open: boolean;
  /** Name of the player to move — the one a resignation or draw offer comes from. */
  turnName: string;
  paused: boolean;
  canOfferDraw: boolean;
  showDraw?: boolean;
  onResume: () => void;
  onRestart: () => void;
  onOfferDraw: () => void;
  onResign: () => void;
  onSettings: () => void;
  onHome: () => void;
}

export function GameMenu({
  open,
  turnName,
  paused,
  canOfferDraw,
  showDraw = true,
  onResume,
  onRestart,
  onOfferDraw,
  onResign,
  onSettings,
  onHome,
}: GameMenuProps) {
  return (
    <Dialog
      open={open}
      onClose={onResume}
      title={paused ? "Paused" : "Game menu"}
      description={paused ? "Both clocks are stopped until you resume." : undefined}
    >
      <div className="space-y-2">
        <Button variant="primary" size="lg" block onClick={onResume} autoFocus>
          Resume
        </Button>

        <div className="grid grid-cols-2 gap-2 pt-1">
          {showDraw && (
            <Button onClick={onOfferDraw} disabled={!canOfferDraw}>
              Offer draw
            </Button>
          )}
          <Button onClick={onRestart}>
            Restart
          </Button>
          <Button onClick={onSettings}>
            Settings
          </Button>
          <Button variant="ghost" onClick={onHome}>
            Return home
          </Button>
        </div>

        <Button variant="danger" block onClick={onResign} className="mt-1">
          Resign as {turnName}
        </Button>
      </div>
    </Dialog>
  );
}
