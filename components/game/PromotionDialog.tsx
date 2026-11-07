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
            className="press group flex flex-col items-center gap-1.5 rounded-md border border-transparent bg-surface px-1 pt-3 pb-2.5 hover:border-accent hover:bg-accent-soft"
          >
            <span
              aria-hidden
              className="block w-full max-w-16 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-1.5 group-hover:scale-110"
            >
              <ChessPiece piece={{ color, type: piece }} style={pieceStyle} />
            </span>
            <span className="text-[0.8125rem] font-semibold text-muted group-hover:text-ink">
              {PIECE_NAMES[piece]}
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onCancel}
        className="mt-4 w-full py-2 text-center text-sm text-muted transition-colors hover:text-ink"
      >
        Cancel this move
      </button>
    </Dialog>
  );
}
