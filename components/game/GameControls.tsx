"use client";

import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { FlipIcon, HandshakeIcon, ListIcon, MenuIcon, UndoIcon } from "@/components/ui/icons";

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
    <div className={clsx("flex items-center gap-1.5", className)}>
      {showUndo && (
        <Button size="sm" variant="ghost" onClick={onUndo} disabled={!canUndo} aria-label="Undo last move">
          <UndoIcon />
          <span className="hidden sm:inline">Undo</span>
        </Button>
      )}

      {showFlip && (
        <Button size="sm" variant="ghost" onClick={onFlip} aria-label="Flip board">
          <FlipIcon />
          <span className="hidden sm:inline">Flip</span>
        </Button>
      )}

      {showDraw && (
        <Button
          size="sm"
          variant="ghost"
          onClick={onOfferDraw}
          disabled={!canOfferDraw}
          aria-label="Offer a draw"
        >
          <HandshakeIcon />
          <span className="hidden sm:inline">Draw</span>
        </Button>
      )}

      {onOpenDetails && (
        <Button size="sm" variant="ghost" onClick={onOpenDetails} aria-label="Show moves and captures">
          <ListIcon />
        </Button>
      )}

      <Button size="sm" variant="secondary" onClick={onOpenMenu} className="ml-auto">
        <MenuIcon />
        Menu
      </Button>
    </div>
  );
}
