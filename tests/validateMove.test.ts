import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { parseMoveInput, validateMove, type MoveInput } from "@/lib/multiplayer/validateMove";
import type { GameRow, MoveRow } from "@/lib/multiplayer/types";
import type { Square } from "@/types";

const WHITE = "11111111-1111-4111-8111-111111111111";
const BLACK = "22222222-2222-4222-8222-222222222222";
const REQUEST = "33333333-3333-4333-8333-333333333333";

/** A game row and move list reached by playing `sans` from the start. */
function gameAfter(sans: string[]) {
  const chess = new Chess();
  const moves: Pick<MoveRow, "from_sq" | "to_sq" | "promotion">[] = [];
  for (const san of sans) {
    const move = chess.move(san);
    moves.push({ from_sq: move.from, to_sq: move.to, promotion: move.promotion ?? null });
  }
  const game = {
    id: "game",
    white_id: WHITE,
    black_id: BLACK,
    status: "active",
    turn: chess.turn(),
    fen: chess.fen(),
    version: sans.length,
  } as GameRow;
  return { game, moves };
}

function input(from: string, to: string, extra: Partial<MoveInput> = {}): MoveInput {
  return { from: from as Square, to: to as Square, promotion: null, expectedVersion: 0, requestId: REQUEST, ...extra };
}

describe("parseMoveInput", () => {
  it("accepts a well-formed body", () => {
    expect(parseMoveInput({ from: "e2", to: "e4", expectedVersion: 0, requestId: REQUEST })).toMatchObject({
      ok: true,
      value: { from: "e2", to: "e4", promotion: null },
    });
  });

  it.each([
    [{ from: "e9", to: "e4", expectedVersion: 0, requestId: REQUEST }],
    [{ from: "e2", to: "e4", expectedVersion: -1, requestId: REQUEST }],
    [{ from: "e2", to: "e4", expectedVersion: 0, requestId: "nope" }],
    [{ from: "e2", to: "e4", expectedVersion: 0, requestId: REQUEST, promotion: "k" }],
    [{ fen: "8/8/8/8/8/8/8/K6k w - - 0 1" }],
    [null],
  ])("rejects %j", (body) => {
    expect(parseMoveInput(body)).toEqual({ ok: false, error: "invalid_request" });
  });
});

describe("validateMove", () => {
  it("accepts a legal move and computes SAN and the new FEN", () => {
    const { game, moves } = gameAfter([]);
    const result = validateMove(game, moves, WHITE, input("g1", "f3"));
    expect(result).toMatchObject({ ok: true, value: { p_san: "Nf3", p_result: null } });
  });

  it("rejects an illegal move", () => {
    const { game, moves } = gameAfter([]);
    expect(validateMove(game, moves, WHITE, input("e2", "e5"))).toEqual({ ok: false, error: "illegal_move" });
  });

  it("rejects the wrong player, an outsider and a stale version", () => {
    const { game, moves } = gameAfter([]);
    expect(validateMove(game, moves, BLACK, input("e7", "e5"))).toEqual({ ok: false, error: "not_your_turn" });
    expect(validateMove(game, moves, "someone", input("e2", "e4"))).toEqual({ ok: false, error: "not_participant" });
    expect(validateMove(game, moves, WHITE, input("e2", "e4", { expectedVersion: 3 }))).toEqual({
      ok: false,
      error: "stale",
    });
  });

  it("rejects moves after the game has ended", () => {
    const { game, moves } = gameAfter([]);
    expect(validateMove({ ...game, status: "finished" }, moves, WHITE, input("e2", "e4"))).toEqual({
      ok: false,
      error: "game_over",
    });
  });

  it("rebuilds castling rights and en passant from the move history", () => {
    const castle = gameAfter(["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"]);
    expect(validateMove(castle.game, castle.moves, WHITE, input("e1", "g1", { expectedVersion: 6 }))).toMatchObject({
      ok: true,
      value: { p_san: "O-O" },
    });

    const passant = gameAfter(["e4", "a6", "e5", "d5"]);
    expect(validateMove(passant.game, passant.moves, WHITE, input("e5", "d6", { expectedVersion: 4 }))).toMatchObject({
      ok: true,
      value: { p_san: "exd6" },
    });
  });

  it("requires a promotion piece exactly when a pawn promotes", () => {
    const { game, moves } = gameAfter(["a4", "h5", "a5", "h4", "a6", "h3", "axb7", "hxg2"]);
    expect(validateMove(game, moves, WHITE, input("b7", "a8", { expectedVersion: 8 }))).toEqual({
      ok: false,
      error: "illegal_move",
    });
    expect(
      validateMove(game, moves, WHITE, input("b7", "a8", { expectedVersion: 8, promotion: "n" })),
    ).toMatchObject({ ok: true, value: { p_san: "bxa8=N", p_promotion: "n" } });
    expect(
      validateMove(game, moves, WHITE, input("a2", "a3", { expectedVersion: 8, promotion: "q" })),
    ).toEqual({ ok: false, error: "illegal_move" });
  });

  it("reports checkmate as the result", () => {
    const { game, moves } = gameAfter(["f3", "e5", "g4"]);
    expect(validateMove(game, moves, BLACK, input("d8", "h4", { expectedVersion: 3 }))).toMatchObject({
      ok: true,
      value: { p_san: "Qh4#", p_result: "black", p_reason: "checkmate" },
    });
  });

  it("refuses to build on a position that disagrees with its history", () => {
    const { game, moves } = gameAfter(["e4"]);
    const tampered = { ...game, fen: "8/8/8/8/8/8/8/K6k b - - 0 1" };
    expect(validateMove(tampered, moves, BLACK, input("e7", "e5", { expectedVersion: 1 }))).toEqual({
      ok: false,
      error: "try_again",
    });
  });
});
