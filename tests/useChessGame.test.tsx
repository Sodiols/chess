// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useChessGame } from "@/hooks/useChessGame";
import { DEFAULT_SETTINGS } from "@/hooks/useGameSettings";
import { ASSISTANCE } from "@/constants/assistance";
import type { AssistanceMode, GameConfig, GameSettings, Square, TimeControl } from "@/types";

const PLAYERS = { w: "Ada", b: "Daniel" };

function makeConfig(
  mode: AssistanceMode = "beginner",
  timeControl: TimeControl | null = null,
): GameConfig {
  return { mode, players: PLAYERS, timeControl };
}

function setup(config = makeConfig(), settings: Partial<GameSettings> = {}) {
  const merged: GameSettings = { ...DEFAULT_SETTINGS, sound: false, ...settings };
  return renderHook(() => useChessGame(config, merged));
}

function play(result: ReturnType<typeof setup>, moves: [Square, Square][]) {
  for (const [from, to] of moves) {
    act(() => result.result.current.attemptMove(from, to));
  }
}

describe("useChessGame — selection", () => {
  it("selects your own piece and lists its legal moves", () => {
    const hook = setup();
    act(() => hook.result.current.selectSquare("e2"));

    expect(hook.result.current.selected).toBe("e2");
    expect(hook.result.current.selectedMoves.map((move) => move.to).sort()).toEqual(["e3", "e4"]);
  });

  it("clicking the same square twice deselects", () => {
    const hook = setup();
    act(() => hook.result.current.selectSquare("e2"));
    act(() => hook.result.current.selectSquare("e2"));
    expect(hook.result.current.selected).toBeNull();
  });

  it("refuses to select an opponent piece and records a rejection", () => {
    const hook = setup();
    act(() => hook.result.current.selectSquare("e7"));

    expect(hook.result.current.selected).toBeNull();
    expect(hook.result.current.rejection).toMatchObject({ from: "e7", to: "e7" });
  });

  it("switches selection between your own pieces without rejecting", () => {
    const hook = setup();
    act(() => hook.result.current.selectSquare("e2"));
    act(() => hook.result.current.selectSquare("d2"));

    expect(hook.result.current.selected).toBe("d2");
    expect(hook.result.current.rejection).toBeNull();
  });

  it("plays the move when a legal destination is clicked", () => {
    const hook = setup();
    act(() => hook.result.current.selectSquare("e2"));
    act(() => hook.result.current.selectSquare("e4"));

    expect(hook.result.current.position.history.map((move) => move.san)).toEqual(["e4"]);
    expect(hook.result.current.position.turn).toBe("b");
    expect(hook.result.current.selected).toBeNull();
  });
});

describe("useChessGame — illegal input", () => {
  it("rejects an illegal destination without changing the position", () => {
    const hook = setup();
    act(() => hook.result.current.attemptMove("e2", "e5"));

    expect(hook.result.current.position.history).toHaveLength(0);
    expect(hook.result.current.rejection).toMatchObject({ from: "e2", to: "e5" });
  });

  it("bumps the rejection token so a repeated attempt replays the cue", () => {
    const hook = setup();
    act(() => hook.result.current.attemptMove("e2", "e5"));
    const first = hook.result.current.rejection!.token;

    act(() => hook.result.current.attemptMove("e2", "e5"));
    expect(hook.result.current.rejection!.token).toBeGreaterThan(first);
  });

  it("ignores moves for the side that is not to move", () => {
    const hook = setup();
    act(() => hook.result.current.attemptMove("e7", "e5"));
    expect(hook.result.current.position.history).toHaveLength(0);
  });

  it("ignores every move once the game is over", () => {
    const hook = setup();
    act(() => hook.result.current.resign("w"));
    expect(hook.result.current.isInteractive).toBe(false);

    act(() => hook.result.current.attemptMove("e2", "e4"));
    expect(hook.result.current.position.history).toHaveLength(0);
  });
});

describe("useChessGame — promotion", () => {
  const line: [Square, Square][] = [
    ["e2", "e4"],
    ["d7", "d5"],
    ["e4", "d5"],
    ["c7", "c6"],
    ["d5", "c6"],
    ["a7", "a6"],
    ["c6", "b7"],
    ["a6", "a5"],
  ];

  it("pauses for a choice instead of assuming a queen", () => {
    const hook = setup();
    play(hook, line);
    act(() => hook.result.current.attemptMove("b7", "a8"));

    expect(hook.result.current.pendingPromotion).toEqual({ from: "b7", to: "a8" });
    expect(hook.result.current.isInteractive).toBe(false);
    // The move is not on the board yet.
    expect(hook.result.current.position.pieceAt.a8).toEqual({ color: "b", type: "r" });
  });

  it("applies the chosen piece", () => {
    const hook = setup();
    play(hook, line);
    act(() => hook.result.current.attemptMove("b7", "a8"));
    act(() => hook.result.current.choosePromotion("n"));

    expect(hook.result.current.position.pieceAt.a8).toEqual({ color: "w", type: "n" });
    expect(hook.result.current.position.lastMove?.san).toBe("bxa8=N");
    expect(hook.result.current.pendingPromotion).toBeNull();
  });

  it("cancelling leaves the position untouched", () => {
    const hook = setup();
    play(hook, line);
    act(() => hook.result.current.attemptMove("b7", "a8"));
    act(() => hook.result.current.cancelPromotion());

    expect(hook.result.current.pendingPromotion).toBeNull();
    expect(hook.result.current.position.pieceAt.b7).toEqual({ color: "w", type: "p" });
    expect(hook.result.current.position.history).toHaveLength(8);
    expect(hook.result.current.isInteractive).toBe(true);
  });

  it("blocks board input while the choice is open", () => {
    const hook = setup();
    play(hook, line);
    act(() => hook.result.current.attemptMove("b7", "a8"));
    act(() => hook.result.current.attemptMove("e1", "e2"));

    expect(hook.result.current.position.history).toHaveLength(8);
  });
});

describe("useChessGame — undo", () => {
  it("takes back the last move and restores the turn", () => {
    const hook = setup();
    play(hook, [
      ["e2", "e4"],
      ["e7", "e5"],
    ]);
    act(() => hook.result.current.undo());

    expect(hook.result.current.position.history.map((move) => move.san)).toEqual(["e4"]);
    expect(hook.result.current.position.turn).toBe("b");
  });

  it("restores castling rights", () => {
    const hook = setup();
    play(hook, [
      ["e2", "e4"],
      ["e7", "e5"],
      ["g1", "f3"],
      ["b8", "c6"],
      ["f1", "c4"],
      ["f8", "c5"],
      ["e1", "g1"],
    ]);
    expect(hook.result.current.position.lastMove?.san).toBe("O-O");

    act(() => hook.result.current.undo());
    const kingMoves = hook.result.current.position.movesFrom.e1 ?? [];
    expect(kingMoves.some((move) => move.to === "g1" && move.isCastle)).toBe(true);
  });

  it("is unavailable when the setting is off", () => {
    const hook = setup(makeConfig(), { allowUndo: false });
    play(hook, [["e2", "e4"]]);

    expect(hook.result.current.canUndo).toBe(false);
    act(() => hook.result.current.undo());
    expect(hook.result.current.position.history).toHaveLength(1);
  });

  it("is unavailable before any move has been played", () => {
    expect(setup().result.current.canUndo).toBe(false);
  });
});

describe("useChessGame — results", () => {
  it("declares checkmate from the position", () => {
    const hook = setup();
    play(hook, [
      ["e2", "e4"],
      ["e7", "e5"],
      ["f1", "c4"],
      ["b8", "c6"],
      ["d1", "h5"],
      ["g8", "f6"],
      ["h5", "f7"],
    ]);

    expect(hook.result.current.result).toEqual({
      kind: "win",
      winner: "w",
      reason: "checkmate",
    });
    expect(hook.result.current.isInteractive).toBe(false);
  });

  it("awards the game to the opponent on resignation", () => {
    const hook = setup();
    act(() => hook.result.current.resign("b"));
    expect(hook.result.current.result).toEqual({
      kind: "win",
      winner: "w",
      reason: "resignation",
    });
  });

  it("draws by agreement only after the offer is accepted", () => {
    const hook = setup();
    act(() => hook.result.current.offerDraw("w"));
    expect(hook.result.current.drawOffer).toBe("w");
    expect(hook.result.current.isInteractive).toBe(false);

    act(() => hook.result.current.respondToDrawOffer(false));
    expect(hook.result.current.drawOffer).toBeNull();
    expect(hook.result.current.result).toBeNull();

    act(() => hook.result.current.offerDraw("b"));
    act(() => hook.result.current.respondToDrawOffer(true));
    expect(hook.result.current.result).toEqual({ kind: "draw", reason: "agreement" });
  });

  it("keeps the first result when a second one arrives", () => {
    const hook = setup();
    act(() => hook.result.current.resign("w"));
    act(() => hook.result.current.respondToDrawOffer(true));

    expect(hook.result.current.result).toEqual({
      kind: "win",
      winner: "b",
      reason: "resignation",
    });
  });
});

describe("useChessGame — clock", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts white's clock and hands it over after each move", () => {
    const config = makeConfig("medium", { initialMs: 60_000, incrementMs: 2_000 });
    const hook = setup(config);

    expect(hook.result.current.clock?.getSnapshot().running).toBe("w");
    act(() => vi.advanceTimersByTime(5_000));
    play(hook, [["e2", "e4"]]);

    const snapshot = hook.result.current.clock!.getSnapshot();
    expect(snapshot.running).toBe("b");
    expect(snapshot.remaining.w).toBeCloseTo(57_000, -2);
  });

  it("ends the game when a flag falls", () => {
    const config = makeConfig("medium", { initialMs: 2_000, incrementMs: 0 });
    const hook = setup(config);

    act(() => vi.advanceTimersByTime(3_000));

    expect(hook.result.current.result).toEqual({
      kind: "win",
      winner: "b",
      reason: "timeout",
    });
    expect(hook.result.current.isInteractive).toBe(false);
  });

  it("refuses a move attempted on the tick the flag falls", () => {
    const config = makeConfig("medium", { initialMs: 2_000, incrementMs: 0 });
    const hook = setup(config);

    // Push past the flag without letting the interval fire, so the timeout is
    // only discovered by the clock read inside the move itself.
    act(() => vi.setSystemTime(Date.now() + 5_000));
    act(() => hook.result.current.attemptMove("e2", "e4"));

    expect(hook.result.current.position.history).toHaveLength(0);
    expect(hook.result.current.result).toEqual({
      kind: "win",
      winner: "b",
      reason: "timeout",
    });
  });

  it("stops the clock when the game ends", () => {
    const config = makeConfig("medium", { initialMs: 60_000, incrementMs: 0 });
    const hook = setup(config);
    act(() => hook.result.current.resign("w"));

    const before = hook.result.current.clock!.getSnapshot().remaining;
    act(() => vi.advanceTimersByTime(10_000));
    expect(hook.result.current.clock!.getSnapshot().remaining).toEqual(before);
  });

  it("rewinds the clock to its pre-move reading on undo", () => {
    const config = makeConfig("beginner", { initialMs: 60_000, incrementMs: 5_000 });
    const hook = setup(config);

    act(() => vi.advanceTimersByTime(10_000));
    play(hook, [["e2", "e4"]]);
    expect(hook.result.current.clock!.getSnapshot().remaining.w).toBeCloseTo(55_000, -2);

    act(() => vi.advanceTimersByTime(4_000));
    act(() => hook.result.current.undo());

    const snapshot = hook.result.current.clock!.getSnapshot();
    // The increment is removed along with the move, and it is white's turn again.
    expect(snapshot.remaining.w).toBeCloseTo(50_000, -2);
    expect(snapshot.running).toBe("w");
  });

  it("pauses and resumes deliberately", () => {
    const config = makeConfig("medium", { initialMs: 60_000, incrementMs: 0 });
    const hook = setup(config);

    act(() => hook.result.current.togglePause());
    expect(hook.result.current.paused).toBe(true);
    expect(hook.result.current.isInteractive).toBe(false);

    act(() => vi.advanceTimersByTime(10_000));
    const held = hook.result.current.clock!.getSnapshot().remaining.w;

    act(() => hook.result.current.togglePause());
    expect(hook.result.current.paused).toBe(false);
    expect(hook.result.current.clock!.getSnapshot().remaining.w).toBeCloseTo(held, -2);
  });

  it("does nothing for an untimed game", () => {
    const hook = setup();
    expect(hook.result.current.clock).toBeNull();

    act(() => hook.result.current.togglePause());
    expect(hook.result.current.paused).toBe(false);
  });
});

describe("useChessGame — orientation", () => {
  it("never rotates on its own, however many moves are played", () => {
    const hook = setup();
    expect(hook.result.current.orientation).toBe("w");

    play(hook, [
      ["e2", "e4"],
      ["e7", "e5"],
      ["g1", "f3"],
      ["b8", "c6"],
    ]);
    expect(hook.result.current.orientation).toBe("w");
  });

  it("flips only when the player asks", () => {
    const hook = setup();
    act(() => hook.result.current.flipBoard());
    expect(hook.result.current.orientation).toBe("b");

    act(() => hook.result.current.flipBoard());
    expect(hook.result.current.orientation).toBe("w");
  });

  it("keeps a manual flip in place across moves and undo", () => {
    const hook = setup();
    act(() => hook.result.current.flipBoard());

    play(hook, [["e2", "e4"]]);
    expect(hook.result.current.orientation).toBe("b");

    act(() => hook.result.current.undo());
    expect(hook.result.current.orientation).toBe("b");
  });
});

describe("useChessGame — assistance never changes the rules", () => {
  const line: [Square, Square][] = [
    ["e2", "e4"],
    ["e7", "e5"],
    ["g1", "f3"],
    ["b8", "c6"],
    ["f1", "c4"],
    ["f8", "c5"],
  ];

  it("offers identical legal moves in every mode", () => {
    const fingerprints = (["beginner", "medium", "pro"] as AssistanceMode[]).map((mode) => {
      const hook = setup(makeConfig(mode));
      play(hook, line);
      return JSON.stringify(hook.result.current.position.movesFrom);
    });

    expect(new Set(fingerprints).size).toBe(1);
  });

  it("exposes only the assistance switches the mode allows", () => {
    const beginner = setup(makeConfig("beginner")).result.current;
    const medium = setup(makeConfig("medium")).result.current;
    const pro = setup(makeConfig("pro")).result.current;

    expect(beginner.assistance).toEqual(ASSISTANCE.beginner);
    expect(medium.assistance).toEqual(ASSISTANCE.medium);
    expect(pro.assistance).toEqual(ASSISTANCE.pro);

    expect(beginner.coach).not.toBeNull();
    expect(medium.coach).toBeNull();
    expect(pro.coach).toBeNull();
  });

  it("computes pins only when the mode surfaces them", () => {
    const fen: [Square, Square][] = [];
    const beginner = setup(makeConfig("beginner"));
    const pro = setup(makeConfig("pro"));
    play(beginner, fen);
    play(pro, fen);

    expect(pro.result.current.pins).toEqual({});
  });
});
