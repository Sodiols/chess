import { describe, expect, it } from "vitest";
import { ChessEngine } from "@/lib/chess/engine";
import {
  describeResult,
  describeSquare,
  formatClock,
  formatDuration,
  formatTimeControl,
  toMovePairs,
} from "@/lib/chess/format";
import type { GameResult, Square } from "@/types";

const players = { w: "Ada", b: "Daniel" };

describe("toMovePairs", () => {
  it("groups half-moves into numbered pairs", () => {
    const engine = new ChessEngine();
    for (const [from, to] of [
      ["e2", "e4"],
      ["e7", "e5"],
      ["g1", "f3"],
      ["b8", "c6"],
      ["f1", "b5"],
    ] as [Square, Square][]) {
      engine.move(from, to);
    }

    const pairs = toMovePairs(engine.snapshot().history);
    expect(pairs.map((pair) => [pair.number, pair.white?.san, pair.black?.san])).toEqual([
      [1, "e4", "e5"],
      [2, "Nf3", "Nc6"],
      [3, "Bb5", undefined],
    ]);
  });

  it("returns nothing for an empty history", () => {
    expect(toMovePairs([])).toEqual([]);
  });

  it("keeps numbering aligned when black moves first", () => {
    const engine = new ChessEngine("4k3/8/8/8/8/8/8/4K3 b - - 0 1");
    engine.move("e8", "e7");
    engine.move("e1", "e2");

    const pairs = toMovePairs(engine.snapshot().history);
    expect(pairs).toHaveLength(2);
    expect(pairs[0]?.black?.san).toBe("Ke7");
    expect(pairs[1]?.white?.san).toBe("Ke2");
  });
});

describe("formatClock", () => {
  it("shows minutes and seconds above ten seconds", () => {
    expect(formatClock(600_000)).toBe("10:00");
    expect(formatClock(65_000)).toBe("1:05");
    expect(formatClock(10_000)).toBe("0:10");
  });

  it("adds a tenth of a second below ten seconds", () => {
    expect(formatClock(9_400)).toBe("0:09.4");
    expect(formatClock(1_050)).toBe("0:01.0");
  });

  it("shows hours for long time controls", () => {
    expect(formatClock(3_600_000)).toBe("1:00:00");
    expect(formatClock(5_425_000)).toBe("1:30:25");
  });

  it("never renders negative time", () => {
    expect(formatClock(0)).toBe("0:00.0");
    expect(formatClock(-500)).toBe("0:00.0");
  });
});

describe("formatDuration and formatTimeControl", () => {
  it("formats a game length", () => {
    expect(formatDuration(95_000)).toBe("1m 35s");
    expect(formatDuration(7_500_000)).toBe("2h 5m");
  });

  it("formats a time control with and without increment", () => {
    expect(formatTimeControl(300_000, 0)).toBe("5 min");
    expect(formatTimeControl(180_000, 2_000)).toBe("3+2");
    expect(formatTimeControl(90_000, 0)).toBe("1.5 min");
  });
});

describe("describeSquare", () => {
  it("names the piece and its square", () => {
    expect(describeSquare("f3", { color: "w", type: "n" })).toBe("White knight on f3");
    expect(describeSquare("d8", { color: "b", type: "q" })).toBe("Black queen on d8");
  });

  it("marks empty squares", () => {
    expect(describeSquare("e4")).toBe("e4, empty");
  });
});

describe("describeResult", () => {
  it("names the winner and how they won", () => {
    const mate: GameResult = { kind: "win", winner: "b", reason: "checkmate" };
    expect(describeResult(mate, players)).toEqual({
      headline: "Checkmate — Daniel wins",
      detail: "Daniel delivered mate",
    });
  });

  it("names the player who resigned", () => {
    const result: GameResult = { kind: "win", winner: "w", reason: "resignation" };
    expect(describeResult(result, players).detail).toBe("Daniel resigned");
  });

  it("names the player who ran out of time", () => {
    const result: GameResult = { kind: "win", winner: "b", reason: "timeout" };
    expect(describeResult(result, players).detail).toBe("Ada ran out of time");
  });

  it("explains every draw reason", () => {
    const reasons = [
      "stalemate",
      "threefold-repetition",
      "fifty-move-rule",
      "insufficient-material",
      "agreement",
      "timeout-insufficient-material",
    ] as const;

    for (const reason of reasons) {
      const { headline, detail } = describeResult({ kind: "draw", reason }, players);
      expect(headline.startsWith("Draw — ")).toBe(true);
      expect(detail.length).toBeGreaterThan(10);
    }
  });
});
