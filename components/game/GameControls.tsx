"use client";

import clsx from "clsx";
import { Button } from "@/components/ui/Button";

interface GameControlsProps {
  canUndo: boolean;
  showUndo: boolean;
  canOfferDraw: boolean;
  /** False where draws can't be offered, e.g. against the computer. */
  showDraw?: boolean;
  /** Hidden in online games, where flipping is the only board control. */
  showFlip?: boolean;
  onUndo: () => void;
  onFlip: () => void;
  onOfferDraw: () => void;
  onOpenMenu: () => void;
  /** Mobile only: opens the drawer holding history and captured material. */
  onOpenDetails?: () => void;
  className?: string;
}

export function GameControls({
  canUndo,
  showUndo,
  canOfferDraw,
  showDraw = true,
  showFlip = true,
  onUndo,
  onFlip,
  onOfferDraw,
  onOpenMenu,
  onOpenDetails,
  className,
}: GameControlsProps) {
  return (
    <div className={clsx("flex flex-wrap items-center gap-1 sm:gap-1.5", className)}>
      {showUndo && (
        <Button size="sm" className="max-sm:h-11 max-sm:px-2.5" variant="ghost" onClick={onUndo} disabled={!canUndo} aria-label="Undo last move">
          Undo
        </Button>
      )}

      {showFlip && (
        <Button size="sm" className="max-sm:h-11 max-sm:px-2.5" variant="ghost" onClick={onFlip} aria-label="Flip board">
          Flip
        </Button>
      )}

      {showDraw && (
        <Button
          size="sm" className="max-sm:h-11 max-sm:px-2.5"
          variant="ghost"
          onClick={onOfferDraw}
          disabled={!canOfferDraw}
          aria-label="Offer a draw"
        >
          Draw
        </Button>
      )}

      {onOpenDetails && (
        <Button size="sm" className="max-sm:h-11 max-sm:px-2.5" variant="ghost" onClick={onOpenDetails} aria-label="Show moves and captures">
          Details
        </Button>
      )}

      <Button size="sm" className="max-sm:h-11 max-sm:px-2.5" variant="secondary" onClick={onOpenMenu}>
        Menu
      </Button>
    </div>
  );
}
