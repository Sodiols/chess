import { Chess } from "chess.js";
import { detectResult } from "@/lib/chess/engine";
import type { GameResult, PieceSymbol, Square } from "@/types";
import { colorOf, type GameRow, type MoveRow } from "./types";

const SQUARE = /^[a-h][1-8]$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROMOTIONS = new Set(["q", "r", "b", "n"]);

export interface MoveInput {
  from: Square;
  to: Square;
  promotion: PieceSymbol | null;
  expectedVersion: number;
  requestId: string;
}

/** Arguments for `submit_move`, named as the database function expects them. */
export interface SubmitMoveParams {
  p_game: string;
  p_user: string;
  p_expected_version: number;
  p_request_id: string;
  p_from: Square;
  p_to: Square;
  p_promotion: PieceSymbol | null;
  p_san: string;
  p_fen_after: string;
  p_result: "white" | "black" | "draw" | null;
  p_reason: string | null;
}

type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

/** Untrusted request body → typed move input. */
export function parseMoveInput(body: unknown): Outcome<MoveInput> {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_request" };
  const { from, to, promotion, expectedVersion, requestId } = body as Record<string, unknown>;

  if (typeof from !== "string" || !SQUARE.test(from)) return { ok: false, error: "invalid_request" };
  if (typeof to !== "string" || !SQUARE.test(to)) return { ok: false, error: "invalid_request" };
  if (promotion != null && (typeof promotion !== "string" || !PROMOTIONS.has(promotion))) {
    return { ok: false, error: "invalid_request" };
  }
  if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion) || expectedVersion < 0) {
    return { ok: false, error: "invalid_request" };
  }
  if (typeof requestId !== "string" || !UUID.test(requestId)) return { ok: false, error: "invalid_request" };

  return {
    ok: true,
    value: {
      from: from as Square,
      to: to as Square,
      promotion: (promotion as PieceSymbol | null | undefined) ?? null,
      expectedVersion,
      requestId,
    },
  };
}

/**
 * The trusted half of a move: rebuilds the game from its full move list (so
 * castling rights, en passant and repetition are exact), checks it matches the
 * stored position, and asks chess.js whether the move is legal. The database
 * then rechecks version, turn and clock under a row lock.
 */
export function validateMove(
  game: GameRow,
  moves: Pick<MoveRow, "from_sq" | "to_sq" | "promotion">[],
  userId: string,
  input: MoveInput,
): Outcome<SubmitMoveParams> {
  const color = colorOf(game, userId);
  if (!color) return { ok: false, error: "not_participant" };
  if (game.status !== "active") return { ok: false, error: "game_over" };
  if (game.turn !== color) return { ok: false, error: "not_your_turn" };
  if (game.version !== input.expectedVersion) return { ok: false, error: "stale" };

  const chess = new Chess();
  for (const move of moves) {
    try {
      chess.move({ from: move.from_sq, to: move.to_sq, promotion: move.promotion ?? undefined });
    } catch {
      return { ok: false, error: "try_again" };
    }
  }
  // The stored FEN and the replayed history must agree, or the record is corrupt.
  if (chess.fen() !== game.fen) return { ok: false, error: "try_again" };

  const legal = chess
    .moves({ square: input.from, verbose: true })
    .filter((move) => move.to === input.to);
  if (legal.length === 0) return { ok: false, error: "illegal_move" };
  // Promotions must name their piece; anything else must not.
  const needsPromotion = legal.some((move) => move.isPromotion());
  if (needsPromotion !== (input.promotion !== null)) return { ok: false, error: "illegal_move" };

  const played = chess.move({ from: input.from, to: input.to, promotion: input.promotion ?? undefined });
  const result = toRowResult(detectResult(chess));

  return {
    ok: true,
    value: {
      p_game: game.id,
      p_user: userId,
      p_expected_version: input.expectedVersion,
      p_request_id: input.requestId,
      p_from: input.from,
      p_to: input.to,
      p_promotion: input.promotion,
      p_san: played.san,
      p_fen_after: chess.fen(),
      p_result: result?.result ?? null,
      p_reason: result?.reason ?? null,
    },
  };
}

function toRowResult(result: GameResult | null) {
  if (!result) return null;
  if (result.kind === "draw") return { result: "draw" as const, reason: result.reason };
  return { result: result.winner === "w" ? ("white" as const) : ("black" as const), reason: result.reason };
}
