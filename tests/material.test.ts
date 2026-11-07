import { describe, expect, it } from "vitest";
import { ChessEngine } from "@/lib/chess/engine";
import { canEverMate, computeMaterial, resultFromFlagFall } from "@/lib/chess/material";
import type { Square } from "@/types";

function play(engine: ChessEngine, moves: [Square, Square][]): void {
  for (const [from, to] of moves) engine.move(from, to);
}

describe("computeMaterial", () => {
  it("reports nothing captured and level material at the start", () => {
    const engine = new ChessEngine();
    const material = computeMaterial([], engine.snapshot().pieceAt);
    expect(material).toEqual({ captured: { w: [], b: [] }, advantage: 0 });
  });

  it("credits each capture to the player who made it", () => {
    const engine = new ChessEngine();
    play(engine, [
      ["e2", "e4"],
      ["d7", "d5"],
      ["e4", "d5"],
      ["d8", "d5"],
    ]);

    const snapshot = engine.snapshot();
    const material = computeMaterial(snapshot.history, snapshot.pieceAt);
    expect(material.captured.w).toEqual(["p"]);
    expect(material.captured.b).toEqual(["p"]);
    expect(material.advantage).toBe(0);
  });

  it("orders captured pieces by descending value", () => {
    const engine = new ChessEngine("3qk3/8/8/8/8/8/8/3RK3 w - - 0 1");
    engine.move("d1", "d8");
    const snapshot = engine.snapshot();
    expect(computeMaterial(snapshot.history, snapshot.pieceAt).captured.w).toEqual(["q"]);
  });

  it("counts en passant captures", () => {
    const engine = new ChessEngine("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2");
    engine.move("e5", "d6");
    const snapshot = engine.snapshot();
    expect(computeMaterial(snapshot.history, snapshot.pieceAt).captured.w).toEqual(["p"]);
  });

  it("reflects promotions in the advantage, since it is read off the board", () => {
    const engine = new ChessEngine("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
    const before = engine.snapshot();
    expect(computeMaterial(before.history, before.pieceAt).advantage).toBe(1);

    engine.move("a7", "a8", "q");
    const after = engine.snapshot();
    const material = computeMaterial(after.history, after.pieceAt);
    expect(material.advantage).toBe(9);
    // A promotion is not a capture, so nothing is added to the captured list.
    expect(material.captured.w).toEqual([]);
  });

  it("signs the advantage towards white", () => {
    const engine = new ChessEngine("3qk3/8/8/8/8/8/8/4K3 w - - 0 1");
    const snapshot = engine.snapshot();
    expect(computeMaterial(snapshot.history, snapshot.pieceAt).advantage).toBe(-9);
  });
});

describe("canEverMate", () => {
  const pieceAt = (fen: string) => new ChessEngine(fen).snapshot().pieceAt;

  it("says no for a lone king", () => {
    expect(canEverMate(pieceAt("4k3/8/8/8/8/8/8/4K3 w - - 0 1"), "w")).toBe(false);
  });

  it("says no for king and a single minor piece", () => {
    expect(canEverMate(pieceAt("4k3/8/8/8/8/8/8/4KB2 w - - 0 1"), "w")).toBe(false);
    expect(canEverMate(pieceAt("4k3/8/8/8/8/8/8/4KN2 w - - 0 1"), "w")).toBe(false);
  });

  it("says yes once a rook, queen or pawn is present", () => {
    expect(canEverMate(pieceAt("4k3/8/8/8/8/8/8/4KR2 w - - 0 1"), "w")).toBe(true);
    expect(canEverMate(pieceAt("4k3/8/8/8/8/8/8/4KQ2 w - - 0 1"), "w")).toBe(true);
    expect(canEverMate(pieceAt("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"), "w")).toBe(true);
  });

  it("says yes for two minor pieces", () => {
    expect(canEverMate(pieceAt("4k3/8/8/8/8/8/8/3BKB2 w - - 0 1"), "w")).toBe(true);
  });

  it("judges each colour independently", () => {
    const position = pieceAt("4k3/8/8/8/8/8/8/3QK3 w - - 0 1");
    expect(canEverMate(position, "w")).toBe(true);
    expect(canEverMate(position, "b")).toBe(false);
  });
});

describe("resultFromFlagFall", () => {
  const pieceAt = (fen: string) => new ChessEngine(fen).snapshot().pieceAt;

  it("gives the game to an opponent who can still mate", () => {
    const position = pieceAt("4k3/8/8/8/8/8/8/3QK3 w - - 0 1");
    expect(resultFromFlagFall(position, "b")).toEqual({
      kind: "win",
      winner: "w",
      reason: "timeout",
    });
  });

  it("draws when the opponent could never mate", () => {
    // Black flags, but white has only a bishop left and can never deliver mate.
    const position = pieceAt("4k3/8/8/8/8/8/8/4KB2 w - - 0 1");
    expect(resultFromFlagFall(position, "b")).toEqual({
      kind: "draw",
      reason: "timeout-insufficient-material",
    });
  });

  it("draws when both sides are bare", () => {
    const position = pieceAt("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
    expect(resultFromFlagFall(position, "w")).toEqual({
      kind: "draw",
      reason: "timeout-insufficient-material",
    });
  });
});
