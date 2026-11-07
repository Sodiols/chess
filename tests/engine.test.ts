import { describe, expect, it } from "vitest";
import { ChessEngine, opposite } from "@/lib/chess/engine";
import type { Square } from "@/types";

function targets(engine: ChessEngine, from: Square): string[] {
  return (engine.snapshot().movesFrom[from] ?? []).map((move) => move.to).sort();
}

describe("ChessEngine — move legality", () => {
  it("offers the pawn's double push only from its starting rank", () => {
    const engine = new ChessEngine();
    expect(targets(engine, "e2")).toEqual(["e3", "e4"]);

    engine.move("e2", "e3");
    engine.move("e7", "e6");
    expect(targets(engine, "e3")).toEqual(["e4"]);
  });

  it("refuses a move that would leave the player's own king in check", () => {
    // The bishop on e2 is the only thing between the king and the rook on e8.
    const engine = new ChessEngine("4r2k/8/8/8/8/8/4B3/4K3 w - - 0 1");
    expect(targets(engine, "e2")).toEqual([]);
    expect(engine.move("e2", "d3")).toBeNull();
    expect(engine.snapshot().history).toHaveLength(0);
  });

  it("only allows moves that resolve a check", () => {
    const engine = new ChessEngine("4k3/8/8/8/8/8/4R3/4K1N1 b - - 0 1");
    const snapshot = engine.snapshot();
    expect(snapshot.inCheck).toBe(true);
    expect(snapshot.checkSquare).toBe("e8");
    expect(targets(engine, "e8")).toEqual(["d7", "d8", "f7", "f8"]);
  });

  it("never lets a king move onto an attacked square", () => {
    const engine = new ChessEngine("8/8/8/8/8/5k2/8/4K2r w - - 0 1");
    expect(targets(engine, "e1")).not.toContain("f1");
    expect(targets(engine, "e1")).not.toContain("d1");
  });
});

describe("ChessEngine — special moves", () => {
  it("collapses the four promotion variants into one destination", () => {
    const engine = new ChessEngine("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
    const moves = engine.snapshot().movesFrom.a7 ?? [];
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ to: "a8", isPromotion: true });
  });

  it("promotes to the requested piece", () => {
    const engine = new ChessEngine("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
    const played = engine.move("a7", "a8", "n");
    expect(played?.san).toBe("a8=N");
    expect(engine.snapshot().pieceAt.a8).toEqual({ color: "w", type: "n" });
  });

  it("classifies en passant as a capture and reports the captured square", () => {
    const engine = new ChessEngine();
    for (const [from, to] of [
      ["e2", "e4"],
      ["a7", "a6"],
      ["e4", "e5"],
      ["d7", "d5"],
    ] as [Square, Square][]) {
      engine.move(from, to);
    }

    const move = (engine.snapshot().movesFrom.e5 ?? []).find((option) => option.to === "d6");
    // chess.js flags en passant with `e` only, so this guards our own normalisation.
    expect(move).toMatchObject({ isCapture: true, isEnPassant: true, captureSquare: "d5" });

    const played = engine.move("e5", "d6");
    expect(played).toMatchObject({ isCapture: true, isEnPassant: true, captured: "p" });
    expect(engine.snapshot().pieceAt.d5).toBeUndefined();
  });

  it("moves both king and rook when castling", () => {
    const engine = new ChessEngine("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    expect(targets(engine, "e1")).toContain("g1");
    expect(targets(engine, "e1")).toContain("c1");

    engine.move("e1", "g1");
    const snapshot = engine.snapshot();
    expect(snapshot.pieceAt.g1).toEqual({ color: "w", type: "k" });
    expect(snapshot.pieceAt.f1).toEqual({ color: "w", type: "r" });
    expect(snapshot.pieceAt.h1).toBeUndefined();
  });

  it("forbids castling through, out of, and into an attacked square", () => {
    // Rook on f8 covers f1, the square the king would cross.
    expect(targets(new ChessEngine("k4r2/8/8/8/8/8/8/4K2R w K - 0 1"), "e1")).not.toContain("g1");
    // Rook on e8 gives check, so castling is unavailable altogether.
    expect(targets(new ChessEngine("k3r3/8/8/8/8/8/8/4K2R w K - 0 1"), "e1")).not.toContain("g1");
    // Rook on g8 covers the king's destination.
    expect(targets(new ChessEngine("k5r1/8/8/8/8/8/8/4K2R w K - 0 1"), "e1")).not.toContain("g1");
  });

  it("forbids castling when a piece stands between king and rook", () => {
    expect(targets(new ChessEngine("4k3/8/8/8/8/8/8/4KB1R w K - 0 1"), "e1")).not.toContain("g1");
  });

  it("drops castling rights once the king has moved and restores them on undo", () => {
    const engine = new ChessEngine("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    engine.move("e1", "f1");
    engine.move("a8", "b8");
    engine.move("f1", "e1");
    engine.move("b8", "a8");
    expect(targets(engine, "e1")).not.toContain("g1");

    for (let i = 0; i < 4; i++) engine.undo();
    expect(targets(engine, "e1")).toContain("g1");
  });
});

describe("ChessEngine — results", () => {
  it("detects checkmate and names the winner", () => {
    // Back-rank mate: Ra8# with the black king boxed in by its own pawns.
    const engine = new ChessEngine("6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1");
    engine.move("a1", "a8");
    expect(engine.snapshot().result).toEqual({
      kind: "win",
      winner: "w",
      reason: "checkmate",
    });
  });

  it("detects stalemate", () => {
    const engine = new ChessEngine("7k/8/8/5Q2/8/8/8/6K1 w - - 0 1");
    engine.move("f5", "f7");
    const snapshot = engine.snapshot();
    expect(snapshot.inCheck).toBe(false);
    expect(snapshot.result).toEqual({ kind: "draw", reason: "stalemate" });
  });

  it("detects insufficient material once the last pawn is gone", () => {
    const engine = new ChessEngine("4k3/8/8/8/8/8/4p3/4KB2 w - - 0 1");
    engine.move("f1", "e2");
    expect(engine.snapshot().result).toEqual({
      kind: "draw",
      reason: "insufficient-material",
    });
  });

  it("detects threefold repetition", () => {
    const engine = new ChessEngine();
    const shuffle: [Square, Square][] = [
      ["g1", "f3"],
      ["g8", "f6"],
      ["f3", "g1"],
      ["f6", "g8"],
      ["g1", "f3"],
      ["g8", "f6"],
      ["f3", "g1"],
      ["f6", "g8"],
    ];
    for (const [from, to] of shuffle) engine.move(from, to);
    expect(engine.snapshot().result).toEqual({
      kind: "draw",
      reason: "threefold-repetition",
    });
  });

  it("detects the fifty-move rule on the hundredth quiet half-move", () => {
    const engine = new ChessEngine("4k3/8/8/8/8/8/R7/4K2R w - - 99 60");
    expect(engine.snapshot().result).toBeNull();
    engine.move("a2", "a3");
    expect(engine.snapshot().result).toEqual({ kind: "draw", reason: "fifty-move-rule" });
  });

  it("reports checkmate rather than a draw when both could apply", () => {
    // Mate delivered on a position that also has an exhausted fifty-move counter.
    const engine = new ChessEngine("6k1/5ppp/8/8/8/8/8/R3K3 w - - 99 60");
    engine.move("a1", "a8");
    expect(engine.snapshot().result).toMatchObject({ kind: "win", reason: "checkmate" });
  });
});

describe("ChessEngine — history and undo", () => {
  it("restores the en passant right when the capture is taken back", () => {
    const engine = new ChessEngine("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2");
    engine.move("e5", "d6");
    expect(engine.snapshot().pieceAt.d5).toBeUndefined();

    engine.undo();
    const snapshot = engine.snapshot();
    expect(snapshot.pieceAt.d5).toEqual({ color: "b", type: "p" });
    expect(snapshot.pieceAt.e5).toEqual({ color: "w", type: "p" });
    expect((snapshot.movesFrom.e5 ?? []).some((move) => move.to === "d6")).toBe(true);
  });

  it("keeps piece identity stable across a move so animations track one node", () => {
    const engine = new ChessEngine();
    const before = engine.snapshot().pieces.find((piece) => piece.square === "e2")!;
    engine.move("e2", "e4");
    const after = engine.snapshot().pieces.find((piece) => piece.square === "e4")!;
    expect(after.id).toBe(before.id);
  });

  it("removes the captured piece's identity and reuses the mover's", () => {
    const engine = new ChessEngine("4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1");
    const pawnId = engine.snapshot().pieces.find((piece) => piece.square === "e4")!.id;
    const targetId = engine.snapshot().pieces.find((piece) => piece.square === "d5")!.id;

    engine.move("e4", "d5");
    const ids = engine.snapshot().pieces.map((piece) => piece.id);
    expect(ids).toContain(pawnId);
    expect(ids).not.toContain(targetId);
  });

  it("reports no undo available on a fresh game", () => {
    const engine = new ChessEngine();
    expect(engine.canUndo()).toBe(false);
    expect(engine.undo()).toBeNull();
  });

  it("records check and mate suffixes on played moves", () => {
    const engine = new ChessEngine("6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1");
    const played = engine.move("a1", "a8")!;
    expect(played.isCheck).toBe(true);
    expect(played.isCheckmate).toBe(true);
  });
});

describe("opposite", () => {
  it("swaps colours", () => {
    expect(opposite("w")).toBe("b");
    expect(opposite("b")).toBe("w");
  });
});
