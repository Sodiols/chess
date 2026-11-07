import { describe, expect, it } from "vitest";
import { ChessEngine } from "@/lib/chess/engine";
import { findCheckers, findPins } from "@/lib/chess/analysis";
import { getCoachMessage, type CoachContext } from "@/lib/chess/coach";
import type { Square } from "@/types";

/** Builds the context the way `useChessGame` does, from a real position. */
function context(fen: string, overrides: Partial<CoachContext> = {}): CoachContext {
  const engine = new ChessEngine(fen);
  const position = engine.snapshot();
  const selected = overrides.selected ?? null;

  return {
    position,
    result: position.result,
    selected,
    selectedMoves: selected ? (position.movesFrom[selected] ?? []) : [],
    pins: findPins(engine.raw(), position.turn),
    checkers: position.inCheck ? findCheckers(engine.raw(), position.turn) : [],
    awaitingPromotion: false,
    rejection: null,
    ...overrides,
  };
}

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("getCoachMessage — priorities", () => {
  it("asks for a promotion piece above everything else", () => {
    const message = getCoachMessage(context(START, { awaitingPromotion: true }));
    expect(message).toEqual({ tone: "alert", text: "Choose a promotion piece." });
  });

  it("reports a finished game", () => {
    const message = getCoachMessage(context("6k1/5ppp/8/8/8/8/8/R3K3 b - - 0 1", {}));
    expect(message.text).not.toBe("The game is over.");

    const finished = getCoachMessage(
      context(START, { result: { kind: "win", winner: "w", reason: "resignation" } }),
    );
    expect(finished.text).toBe("The game is over.");
  });

  it("prompts the player to select a piece on move one", () => {
    expect(getCoachMessage(context(START)).text).toBe(
      "Select a piece to see everywhere it can legally move.",
    );
  });
});

describe("getCoachMessage — check", () => {
  it("announces check when nothing is selected", () => {
    const message = getCoachMessage(context("4k3/8/8/8/8/8/4R3/4K1N1 b - - 0 1"));
    expect(message.tone).toBe("alert");
    expect(message.text).toContain("Black's king is in check");
  });

  it("calls out a double check", () => {
    const message = getCoachMessage(context("4k3/8/8/8/B7/8/8/4R2K b - - 0 1"));
    expect(message.text).toBe("Double check — only a king move can escape.");
  });
});

describe("getCoachMessage — selection", () => {
  it("counts legal moves for the selected piece", () => {
    const message = getCoachMessage(context(START, { selected: "e2" as Square }));
    expect(message).toEqual({ tone: "guide", text: "Pawn on e2: 2 legal moves." });
  });

  it("mentions castling when it is on offer", () => {
    const message = getCoachMessage(
      context("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", { selected: "e1" as Square }),
    );
    expect(message.text).toContain("castling is available");
  });

  it("mentions en passant when it is on offer", () => {
    const message = getCoachMessage(
      context("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2", { selected: "e5" as Square }),
    );
    expect(message.text).toContain("en passant is available");
  });

  it("counts available captures", () => {
    const message = getCoachMessage(
      context("r1r1k3/1P6/8/8/8/8/8/4K3 w - - 0 1", { selected: "b7" as Square }),
    );
    expect(message.text).toContain("2 captures");
  });

  it("explains a pin that leaves the piece frozen", () => {
    const message = getCoachMessage(
      context("4r2k/8/8/8/8/8/4B3/4K3 w - - 0 1", { selected: "e2" as Square }),
    );
    expect(message.tone).toBe("warn");
    expect(message.text).toContain("pinned by the rook on e8");
    expect(message.text).toContain("cannot move");
  });

  it("explains a pin that still allows moves along the line", () => {
    // The rook may slide along the file it is pinned on.
    const message = getCoachMessage(
      context("4r2k/8/8/8/8/8/4R3/4K3 w - - 0 1", { selected: "e2" as Square }),
    );
    expect(message.text).toContain("only move along that line");
  });

  it("says when a piece cannot help against a check", () => {
    const message = getCoachMessage(
      context("4k3/8/8/8/8/8/4R3/4K1N1 b - - 0 1", { selected: "e8" as Square }),
    );
    // The king itself does have escapes here, so pick a piece that cannot help.
    expect(message.tone).toBe("guide");

    const stuck = getCoachMessage(
      context("rnb1kbnr/pppp1ppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1", {
        selected: "a8" as Square,
      }),
    );
    expect(stuck.text).toContain("no legal moves");
  });
});

describe("getCoachMessage — rejected moves", () => {
  it("explains that it is the other player's turn", () => {
    const message = getCoachMessage(
      context(START, { rejection: { from: "e7" as Square, to: "e7" as Square } }),
    );
    expect(message).toEqual({ tone: "warn", text: "It is White's turn." });
  });

  it("explains an illegal king move as walking into check", () => {
    const message = getCoachMessage(
      context("8/8/8/8/8/5k2/8/4K2r w - - 0 1", {
        rejection: { from: "e1" as Square, to: "f1" as Square },
      }),
    );
    expect(message.text).toBe("Your king would be in check on f1.");
  });

  it("explains that moving a pinned piece exposes the king", () => {
    const message = getCoachMessage(
      context("4r2k/8/8/8/8/8/4B3/4K3 w - - 0 1", {
        rejection: { from: "e2" as Square, to: "d3" as Square },
      }),
    );
    expect(message.text).toContain("exposes your king to the rook on e8");
  });

  it("explains that a move fails to answer a check", () => {
    const message = getCoachMessage(
      context("4k3/7p/8/8/8/8/4R3/4K1N1 b - - 0 1", {
        rejection: { from: "h7" as Square, to: "h6" as Square },
      }),
    );
    expect(message.text).toBe("Your king is in check — that move does not stop it.");
  });

  it("falls back to a plain geometric explanation", () => {
    const message = getCoachMessage(
      context(START, { rejection: { from: "e2" as Square, to: "e5" as Square } }),
    );
    expect(message.text).toBe("A pawn cannot move to e5 from e2.");
  });
});
