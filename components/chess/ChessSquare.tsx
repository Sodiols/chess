"use client";

import { memo } from "react";
import clsx from "clsx";
import type { AssistanceConfig, Piece, Square } from "@/types";
import { describeSquare } from "@/lib/chess/format";
import {
  WASH,
  captureRing,
  checkMark,
  quietDot,
  specialMark,
} from "@/lib/boardMarks";

export interface SquareMarks {
  selected: boolean;
  lastMove: boolean;
  legalQuiet: boolean;
  legalCapture: boolean;
  /** Castling or en passant, surfaced separately for Beginner mode. */
  legalSpecial: boolean;
  captureTarget: boolean;
  check: boolean;
  pinned: boolean;
  dragTarget: boolean;
  rejected: boolean;
}

interface ChessSquareProps {
  square: Square;
  piece?: Piece;
  isLight: boolean;
  marks: SquareMarks;
  checkEmphasis: AssistanceConfig["checkEmphasis"];
  /** File letter shown on the bottom edge; rank number on the left edge. */
  fileLabel?: string;
  rankLabel?: string;
  focusable: boolean;
  onSelect: (square: Square) => void;
  onFocus: (square: Square) => void;
}

export const ChessSquare = memo(function ChessSquare({
  square,
  piece,
  isLight,
  marks,
  checkEmphasis,
  fileLabel,
  rankLabel,
  focusable,
  onSelect,
  onFocus,
}: ChessSquareProps) {
  const overlay = marks.legalSpecial
    ? specialMark()
    : marks.legalCapture
      ? captureRing(isLight)
      : marks.legalQuiet
        ? quietDot(isLight)
        : undefined;

  const wash = marks.rejected
    ? WASH.rejected
    : marks.selected
      ? WASH.selected
      : marks.captureTarget
        ? WASH.captureTarget
        : marks.lastMove
          ? WASH.lastMove
          : undefined;

  return (
    <button
      type="button"
      data-square={square}
      tabIndex={focusable ? 0 : -1}
      aria-label={squareLabel(square, marks, piece)}
      aria-pressed={marks.selected}
      onClick={() => onSelect(square)}
      onFocus={() => onFocus(square)}
      style={{ backgroundColor: isLight ? "var(--board-light)" : "var(--board-dark)" }}
      className={clsx(
        "relative touch-none outline-offset-[-3px]",
        marks.pinned && "outline-2 outline-dashed outline-[rgba(226,181,105,0.9)]",
      )}
    >
      {marks.check && (
        <span aria-hidden className="absolute inset-0 animate-check" style={{ background: checkMark(checkEmphasis) }} />
      )}
      {wash && <span aria-hidden className="absolute inset-0" style={{ backgroundColor: wash }} />}
      {marks.lastMove && (
        <span aria-hidden className="pointer-events-none absolute inset-0.5 rounded-[2px] border-2 border-[#ffe0a0] shadow-[0_0_0_1px_#513717]" />
      )}
      {overlay && <span aria-hidden className="absolute inset-0" style={{ background: overlay }} />}

      {marks.dragTarget && (
        <span
          aria-hidden
          className="absolute inset-0 shadow-[inset_0_0_0_3px_var(--color-accent)]"
        />
      )}

      {rankLabel && (
        <span
          aria-hidden
          className="board-coordinate absolute top-[3%] left-[5%] text-[clamp(0.5rem,1.35cqw,0.75rem)]"
          style={{ color: isLight ? "var(--board-dark)" : "var(--board-light)" }}
        >
          {rankLabel}
        </span>
      )}
      {fileLabel && (
        <span
          aria-hidden
          className="board-coordinate absolute right-[5%] bottom-[2%] text-[clamp(0.5rem,1.35cqw,0.75rem)]"
          style={{ color: isLight ? "var(--board-dark)" : "var(--board-light)" }}
        >
          {fileLabel}
        </span>
      )}
    </button>
  );
});

function squareLabel(square: Square, marks: SquareMarks, piece?: Piece): string {
  const parts = [describeSquare(square, piece)];
  if (marks.check) parts.push("in check");
  if (marks.selected) parts.push("selected");
  if (marks.legalCapture || marks.captureTarget) parts.push("can be captured");
  else if (marks.legalSpecial) parts.push("special move available");
  else if (marks.legalQuiet) parts.push("legal move");
  if (marks.pinned) parts.push("pinned");
  if (marks.lastMove) parts.push("last move");
  return parts.join(", ");
}
