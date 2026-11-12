import type { Color, GameResult, Piece, PlayedMove, Square } from "@/types";
import { PIECE_NAMES } from "@/constants/game";

interface MovePair {
  number: number;
  white?: PlayedMove;
  black?: PlayedMove;
}

/**
 * Splits a flat half-move list into scoresheet rows. A game that starts from a
 * position with black to move gets a row of its own, keeping the numbering honest.
 */
export function toMovePairs(history: PlayedMove[]): MovePair[] {
  const pairs: MovePair[] = [];

  for (const move of history) {
    if (move.color === "w") {
      pairs.push({ number: pairs.length + 1, white: move });
      continue;
    }
    const last = pairs[pairs.length - 1];
    if (last && !last.black) last.black = move;
    else pairs.push({ number: pairs.length + 1, black: move });
  }

  return pairs;
}

export function colorName(color: Color): string {
  return color === "w" ? "White" : "Black";
}

/** Accessible label for a square, e.g. "White knight on f3" or "e5, empty". */
export function describeSquare(square: Square, piece?: Piece): string {
  if (!piece) return `${square}, empty`;
  return `${colorName(piece.color)} ${PIECE_NAMES[piece.type].toLowerCase()} on ${square}`;
}

export function formatClock(ms: number): string {
  const safe = Math.max(0, ms);
  const totalSeconds = Math.floor(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  // Below ten seconds a tenth is shown, matching how physical clocks read out.
  if (safe < 10_000) {
    return `${minutes}:${String(seconds).padStart(2, "0")}.${Math.floor((safe % 1000) / 100)}`;
  }
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}:${String(minutes % 60).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function formatTimeControl(initialMs: number, incrementMs: number): string {
  const minutes = initialMs / 60_000;
  const label = Number.isInteger(minutes) ? `${minutes}` : minutes.toFixed(1);
  return incrementMs > 0 ? `${label}+${incrementMs / 1000}` : `${label} min`;
}

export function describeResult(
  result: GameResult,
  players: Record<Color, string>,
): { headline: string; detail: string } {
  if (result.kind === "win") {
    const reason = {
      checkmate: "Checkmate",
      resignation: "Resignation",
      timeout: "Time out",
      disconnect: "Disconnect",
    }[result.reason];
    const loser = result.winner === "w" ? "b" : "w";
    const detail =
      result.reason === "resignation"
        ? `${players[loser]} resigned`
        : result.reason === "timeout"
          ? `${players[loser]} ran out of time`
          : result.reason === "disconnect"
            ? `${players[loser]} did not reconnect within 30 seconds`
            : `${players[result.winner]} delivered mate`;
    return { headline: `${reason} — ${players[result.winner]} wins`, detail };
  }

  const detail = {
    stalemate: "The player to move has no legal move and is not in check",
    "threefold-repetition": "The same position occurred three times",
    "fifty-move-rule": "Fifty moves passed with no capture and no pawn move",
    "insufficient-material": "Neither side has enough material to deliver mate",
    agreement: "Both players agreed to a draw",
    "mutual-disconnect": "Both players disconnected at the same time",
    "timeout-insufficient-material":
      "A player ran out of time, but the opponent cannot deliver mate",
  }[result.reason];

  const headline = {
    stalemate: "Draw — Stalemate",
    "threefold-repetition": "Draw — Threefold repetition",
    "fifty-move-rule": "Draw — Fifty-move rule",
    "insufficient-material": "Draw — Insufficient material",
    agreement: "Draw — By agreement",
    "mutual-disconnect": "Draw — Both players disconnected",
    "timeout-insufficient-material": "Draw — Timeout vs insufficient material",
  }[result.reason];

  return { headline, detail };
}
