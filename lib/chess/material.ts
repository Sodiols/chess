import type {
  Color,
  GameResult,
  MaterialBalance,
  Piece,
  PieceSymbol,
  PlayedMove,
  Square,
} from "@/types";
import { CAPTURE_ORDER, PIECE_VALUES } from "@/constants/game";

/**
 * Captured lists come from the move history, while the advantage is read off the
 * board so promotions are reflected rather than ignored.
 */
export function computeMaterial(
  history: PlayedMove[],
  pieceAt: Partial<Record<Square, Piece>>,
): MaterialBalance {
  const captured: Record<Color, PieceSymbol[]> = { w: [], b: [] };

  for (const move of history) {
    if (move.captured) captured[move.color].push(move.captured);
  }

  const rank = (piece: PieceSymbol) => CAPTURE_ORDER.indexOf(piece);
  captured.w.sort((a, b) => rank(a) - rank(b));
  captured.b.sort((a, b) => rank(a) - rank(b));

  let advantage = 0;
  for (const piece of Object.values(pieceAt)) {
    if (!piece) continue;
    advantage += piece.color === "w" ? PIECE_VALUES[piece.type] : -PIECE_VALUES[piece.type];
  }

  return { captured, advantage };
}

/**
 * Whether `color` retains enough material to deliver mate, used to decide if a
 * flag fall is a loss or a draw. Follows the common practical rule (lone king,
 * K+N and K+B cannot mate) rather than FIDE's exhaustive helpmate search.
 */
export function canEverMate(pieceAt: Partial<Record<Square, Piece>>, color: Color): boolean {
  const counts: Partial<Record<PieceSymbol, number>> = {};
  for (const piece of Object.values(pieceAt)) {
    if (piece?.color !== color) continue;
    counts[piece.type] = (counts[piece.type] ?? 0) + 1;
  }

  if (counts.p || counts.r || counts.q) return true;
  const minors = (counts.n ?? 0) + (counts.b ?? 0);
  return minors >= 2;
}

/**
 * Outcome of a flag fall. Running out of time only loses if the opponent still has
 * the material to mate; otherwise the game is drawn.
 */
export function resultFromFlagFall(
  pieceAt: Partial<Record<Square, Piece>>,
  flagged: Color,
): GameResult {
  const winner: Color = flagged === "w" ? "b" : "w";
  return canEverMate(pieceAt, winner)
    ? { kind: "win", winner, reason: "timeout" }
    : { kind: "draw", reason: "timeout-insufficient-material" };
}
