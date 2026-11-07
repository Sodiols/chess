import { describe, expect, it } from "vitest";
import { ChessEngine } from "@/lib/chess/engine";
import { OPENINGS } from "@/constants/openings";

describe("showcase openings", () => {
  for (const [id, opening] of Object.entries(OPENINGS)) {
    it(`${id} is a legal line`, () => {
      const engine = new ChessEngine();
      for (const [from, to] of opening.line) {
        expect(engine.move(from, to), `${opening.name}: ${from}-${to}`).not.toBeNull();
      }
    });
  }

  it("Scholar's Mate ends in checkmate for White", () => {
    const engine = new ChessEngine();
    for (const [from, to] of OPENINGS.scholarsMate.line) engine.move(from, to);
    expect(engine.snapshot().result).toEqual({ kind: "win", winner: "w", reason: "checkmate" });
  });
});
