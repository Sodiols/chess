import { memo } from "react";
import clsx from "clsx";
import type { Piece, PieceStyleId } from "@/types";
import { PIECE_GEOMETRY, PIECE_VIEWBOX } from "@/lib/pieces";

const LIGHT_BODY = "#f6f2ea";
const DARK_BODY = "#26231f";
/** Black pieces carry a light outline so they read on dark squares too. */
const LIGHT_EDGE = "#cfc7b8";
const DARK_EDGE = "#26231f";

interface ChessPieceProps {
  piece: Piece;
  style: PieceStyleId;
  className?: string;
}

export const ChessPiece = memo(function ChessPiece({ piece, style, className }: ChessPieceProps) {
  const geometry = PIECE_GEOMETRY[piece.type];
  const isWhite = piece.color === "w";
  const body = isWhite ? LIGHT_BODY : DARK_BODY;
  const edge = isWhite ? DARK_EDGE : LIGHT_EDGE;
  const outlined = style === "classic";

  return (
    <svg
      viewBox={PIECE_VIEWBOX}
      aria-hidden
      focusable="false"
      className={clsx(
        "size-full select-none [filter:drop-shadow(0_1px_1.5px_rgba(0,0,0,0.32))]",
        className,
      )}
    >
      <g
        fill={body}
        stroke={outlined ? edge : "none"}
        strokeWidth={1.15}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {geometry.body.map((d, index) => (
          <path key={index} d={d} />
        ))}
      </g>

      {geometry.detail?.map((detail, index) => {
        // The Minimal set drops engraving, but the knight still needs its eye to
        // read as a horse at small sizes.
        if (!outlined && !(detail.kind === "fill" && piece.type === "n")) return null;
        return detail.kind === "fill" ? (
          <path key={index} d={detail.d} fill={edge} />
        ) : (
          <path key={index} d={detail.d} fill="none" stroke={edge} strokeWidth={1.3} strokeLinecap="round" />
        );
      })}
    </svg>
  );
});
