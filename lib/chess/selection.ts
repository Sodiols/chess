import type { Square } from "@/types";
import type { Position } from "./engine";

export type ClickOutcome =
  | { kind: "select"; square: Square | null }
  | { kind: "move"; from: Square; to: Square }
  | { kind: "reject"; from: Square; to: Square }
  | { kind: "none" };

/**
 * What a click on `square` means given the current selection. Shared by every
 * game mode so the board behaves identically offline and online.
 */
export function resolveSquareClick(
  position: Position,
  selected: Square | null,
  square: Square,
): ClickOutcome {
  const piece = position.pieceAt[square];

  if (selected === square) return { kind: "select", square: null };

  if (selected) {
    if (position.movesFrom[selected]?.some((candidate) => candidate.to === square)) {
      return { kind: "move", from: selected, to: square };
    }
    // Re-targeting to another of your own pieces is a new selection, not a failed move.
    if (piece?.color === position.turn) return { kind: "select", square };
    return { kind: "reject", from: selected, to: square };
  }

  if (piece?.color === position.turn) return { kind: "select", square };
  if (piece) return { kind: "reject", from: square, to: square };
  return { kind: "none" };
}
