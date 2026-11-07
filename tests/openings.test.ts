import { describe, expect, it } from "vitest";
import { ChessEngine } from "@/lib/chess/engine";
import { CHECKMATES, OPENINGS } from "@/constants/openings";

describe("showcase openings", () => {
  for (const [id, opening] of Object.entries(OPENINGS)) {
    it(`${id} is a legal line`, () => {
      const engine = new ChessEngine();
      for (const [from, to] of opening.line) {
        expect(engine.move(from, to), `${opening.name}: ${from}-${to}`).not.toBeNull();
      }
    });
  }

  for (const mate of CHECKMATES) {
    it(`${mate.name} ends in checkmate`, () => {
      const engine = new ChessEngine();
      for (const [from, to] of mate.line) expect(engine.move(from, to), `${mate.name}: ${from}-${to}`).not.toBeNull();
      expect(engine.snapshot().result?.reason).toBe("checkmate");
    });
  }
});
