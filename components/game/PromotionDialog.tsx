"use client";

import type { Color, PieceStyleId, PieceSymbol } from "@/types";
import { PIECE_NAMES, PROMOTION_CHOICES } from "@/constants/game";
import { ChessPiece } from "@/components/chess/ChessPiece";
import { Dialog } from "@/components/ui/Dialog";

interface PromotionDialogProps {
  open: boolean;
  color: Color;
  pieceStyle: PieceStyleId;
  /** File the pawn promoted on, shown so the player can confirm the right pawn. */
  square: string;
  onSelect: (piece: PieceSymbol) => void;
  onCancel: () => void;
}

export function PromotionDialog({
  open,
  color,
  pieceStyle,
  square,
  onSelect,
  onCancel,
}: PromotionDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title="Choose a promotion piece"
      description={`Your pawn reached ${square}. Pick the piece it becomes.`}
    >
      <div className="grid grid-cols-4 gap-2">
        {PROMOTION_CHOICES.map((piece, index) => (
          <button
            key={piece}
            type="button"
            autoFocus={index === 0}
            onClick={() => onSelect(piece)}
            className="group flex flex-col items-center gap-1 rounded-lg border border-line bg-raised px-1 pt-2 pb-1.5 transition-colors hover:border-accent hover:bg-accent-soft"
          >
            <span
              aria-hidden
              className="block w-full max-w-14 transition-transform duration-150 group-hover:scale-105"
            >
              <ChessPiece piece={{ color, type: piece }} style={pieceStyle} />
            </span>
            <span className="text-[0.75rem] font-medium text-muted group-hover:text-ink">
              {PIECE_NAMES[piece]}
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onCancel}
        className="mt-4 w-full text-center text-xs text-faint transition-colors hover:text-muted"
      >
        Cancel this move
      </button>
    </Dialog>
  );
}
