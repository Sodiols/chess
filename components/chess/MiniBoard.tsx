import { Chess } from "chess.js";
import type { PieceStyleId, Square } from "@/types";
import { SQUARES, getBoardTheme, isLightSquare } from "@/constants/board";
import { captureRing, quietDot } from "@/lib/boardMarks";
import { ChessPiece } from "./ChessPiece";

interface MiniBoardProps {
  fen: string;
  /** When set, every legal move from this square is dotted. */
  from?: Square;
  /** Extra squares to wash in accent, for illustrating a rule. */
  marks?: Square[];
  pieceStyle?: PieceStyleId;
  label: string;
}

/**
 * A static illustration board for the rules page. Destinations are read from the
 * same engine the game uses, so a diagram can never contradict the rules.
 */
export function MiniBoard({ fen, from, marks = [], pieceStyle = "classic", label }: MiniBoardProps) {
  const chess = new Chess(fen);
  const theme = getBoardTheme("walnut");

  const destinations = new Map<Square, boolean>();
  if (from) {
    for (const move of chess.moves({ square: from, verbose: true })) {
      destinations.set(move.to, move.isCapture());
    }
  }

  return (
    <div
      data-ui
      className="grid aspect-square w-full grid-cols-8 grid-rows-8 overflow-hidden rounded-[3px]"
      role="img"
      aria-label={label}
      style={
        { "--board-light": theme.light, "--board-dark": theme.dark } as React.CSSProperties
      }
    >
      {SQUARES.map((square) => {
        const light = isLightSquare(square);
        const piece = chess.get(square);
        const capture = destinations.get(square);

        return (
          <div
            key={square}
            className="relative"
            style={{ backgroundColor: light ? "var(--board-light)" : "var(--board-dark)" }}
          >
            {(square === from || marks.includes(square)) && (
              <span className="absolute inset-0 bg-[rgba(214,172,101,0.42)]" />
            )}
            {capture !== undefined && (
              <span
                className="absolute inset-0"
                style={{ background: capture ? captureRing(light) : quietDot(light) }}
              />
            )}
            {piece && (
              <span className="absolute inset-0 p-[4%]">
                <ChessPiece piece={{ color: piece.color, type: piece.type }} style={pieceStyle} />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
