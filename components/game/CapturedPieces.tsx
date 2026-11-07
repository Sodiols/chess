import clsx from "clsx";
import type { Color, PieceStyleId, PieceSymbol } from "@/types";
import { PIECE_NAMES } from "@/constants/game";
import { ChessPiece } from "@/components/chess/ChessPiece";

interface CapturedPiecesProps {
  /** Pieces this player has taken; they belong to the opposing colour. */
  pieces: PieceSymbol[];
  capturedColor: Color;
  pieceStyle: PieceStyleId;
  /** Material lead in pawns, shown only when positive. */
  lead: number;
  showLead: boolean;
  className?: string;
}

export function CapturedPieces({
  pieces,
  capturedColor,
  pieceStyle,
  lead,
  showLead,
  className,
}: CapturedPiecesProps) {
  const hasContent = pieces.length > 0 || (showLead && lead > 0);

  return (
    <div className={clsx("flex min-h-5 flex-wrap items-center gap-x-0.5 gap-y-1", className)}>
      {pieces.length > 0 && (
        <span className="sr-only">
          Captured: {pieces.map((piece) => PIECE_NAMES[piece]).join(", ")}
        </span>
      )}

      {pieces.map((piece, index) => (
        <span key={`${piece}-${index}`} aria-hidden className="block size-[18px] opacity-70">
          <ChessPiece piece={{ color: capturedColor, type: piece }} style={pieceStyle} />
        </span>
      ))}

      {showLead && lead > 0 && (
        <span className="numeric ml-1 text-xs font-medium text-muted">+{lead}</span>
      )}

      {!hasContent && <span className="text-xs text-faint">—</span>}
    </div>
  );
}
