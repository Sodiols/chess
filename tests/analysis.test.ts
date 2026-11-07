import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { findCheckers, findPins } from "@/lib/chess/analysis";

describe("findPins", () => {
  it("finds a bishop pinned against its king on a file", () => {
    const chess = new Chess("4r2k/8/8/8/8/8/4B3/4K3 w - - 0 1");
    expect(findPins(chess, "w")).toEqual({ e2: { pinnedBy: "e8", pinnerType: "r" } });
  });

  it("finds a knight pinned on a diagonal by a bishop", () => {
    const chess = new Chess("7k/8/8/8/1b6/8/3N4/4K3 w - - 0 1");
    expect(findPins(chess, "w")).toEqual({ d2: { pinnedBy: "b4", pinnerType: "b" } });
  });

  it("recognises a queen as a pinner on both ray types", () => {
    expect(findPins(new Chess("4q2k/8/8/8/8/8/4N3/4K3 w - - 0 1"), "w")).toEqual({
      e2: { pinnedBy: "e8", pinnerType: "q" },
    });
    expect(findPins(new Chess("7k/8/8/8/1q6/8/3N4/4K3 w - - 0 1"), "w")).toEqual({
      d2: { pinnedBy: "b4", pinnerType: "q" },
    });
  });

  it("does not report a pin when a second piece shares the line", () => {
    // Two white pieces between king and rook: neither is absolutely pinned.
    const chess = new Chess("4r2k/8/8/8/8/4N3/4B3/4K3 w - - 0 1");
    expect(findPins(chess, "w")).toEqual({});
  });

  it("does not report a pin from a piece that cannot slide along the ray", () => {
    // A knight on e8 attacks nothing along the e-file.
    const chess = new Chess("4n2k/8/8/8/8/8/4B3/4K3 w - - 0 1");
    expect(findPins(chess, "w")).toEqual({});
  });

  it("does not treat an enemy piece adjacent to the king as pinned", () => {
    const chess = new Chess("4r2k/8/8/8/8/8/4r3/4K3 w - - 0 1");
    expect(findPins(chess, "w")).toEqual({});
  });

  it("reports pins for the requested colour only", () => {
    const chess = new Chess("4k3/4b3/8/8/8/8/8/4R2K w - - 0 1");
    expect(findPins(chess, "b")).toEqual({ e7: { pinnedBy: "e1", pinnerType: "r" } });
    expect(findPins(chess, "w")).toEqual({});
  });
});

describe("findCheckers", () => {
  it("returns the single checking piece", () => {
    const chess = new Chess("4k3/8/8/8/8/8/4R3/4K3 b - - 0 1");
    expect(findCheckers(chess, "b")).toEqual(["e2"]);
  });

  it("returns both pieces in a double check", () => {
    // Both the rook on e1 and the bishop on a4 hit the black king on e8.
    const chess = new Chess("4k3/8/8/8/B7/8/8/4R2K b - - 0 1");
    expect(findCheckers(chess, "b").sort()).toEqual(["a4", "e1"]);
  });

  it("returns nothing when the king is safe", () => {
    expect(findCheckers(new Chess(), "w")).toEqual([]);
  });
});
