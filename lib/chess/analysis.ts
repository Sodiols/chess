import type { Chess } from "chess.js";
import type { Color, PieceSymbol, Square } from "@/types";
import { FILES, fileIndex } from "@/constants/board";

export interface PinInfo {
  /** Square of the enemy slider creating the pin. */
  pinnedBy: Square;
  pinnerType: PieceSymbol;
}

const ORTHOGONAL: readonly [number, number][] = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
];

const DIAGONAL: readonly [number, number][] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

function toSquare(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return `${FILES[file]}${rank + 1}` as Square;
}

/**
 * Absolute pins only: a friendly piece standing between its own king and an
 * enemy slider. Used by Beginner mode; it never influences move legality, which
 * chess.js already handles.
 */
export function findPins(chess: Chess, color: Color): Partial<Record<Square, PinInfo>> {
  const pins: Partial<Record<Square, PinInfo>> = {};
  const king = chess.findPiece({ color, type: "k" })[0];
  if (!king) return pins;

  const kingFile = fileIndex(king);
  const kingRank = Number(king[1]) - 1;

  const rays: { directions: readonly [number, number][]; sliders: PieceSymbol[] }[] = [
    { directions: ORTHOGONAL, sliders: ["r", "q"] },
    { directions: DIAGONAL, sliders: ["b", "q"] },
  ];

  for (const { directions, sliders } of rays) {
    for (const [df, dr] of directions) {
      let candidate: Square | null = null;

      for (let step = 1; step < 8; step++) {
        const square = toSquare(kingFile + df * step, kingRank + dr * step);
        if (!square) break;

        const piece = chess.get(square);
        if (!piece) continue;

        if (!candidate) {
          // The first piece along the ray can only be pinned if it is ours.
          if (piece.color !== color) break;
          candidate = square;
          continue;
        }

        if (piece.color !== color && sliders.includes(piece.type)) {
          pins[candidate] = { pinnedBy: square, pinnerType: piece.type };
        }
        break;
      }
    }
  }

  return pins;
}

/** Squares of enemy pieces currently giving check. Two of them means double check. */
export function findCheckers(chess: Chess, color: Color): Square[] {
  const king = chess.findPiece({ color, type: "k" })[0];
  if (!king) return [];
  return chess.attackers(king, color === "w" ? "b" : "w");
}
