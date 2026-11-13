import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { OnlineGameStore } from "@/lib/multiplayer/onlineGameStore";
import type { GameRow, GameSnapshot, MoveRow } from "@/lib/multiplayer/types";

const WHITE = "white-player";
const BLACK = "black-player";
const NOW = Date.parse("2026-11-07T12:00:00.000Z");

/** Server-shaped game row and move list after playing `sans`. */
function server(sans: string[], overrides: Partial<GameRow> = {}) {
  const chess = new Chess();
  const moves: MoveRow[] = sans.map((san, index) => {
    const move = chess.move(san);
    return {
      game_id: "g1",
      ply: index + 1,
      player_id: move.color === "w" ? WHITE : BLACK,
      from_sq: move.from,
      to_sq: move.to,
      promotion: move.promotion ?? null,
      san: move.san,
      fen_after: chess.fen(),
      clock_ms: 60_000,
      request_id: `req-${index + 1}`,
      created_at: new Date(NOW).toISOString(),
    };
  });
  const game = {
    id: "g1",
    white_id: WHITE,
    black_id: BLACK,
    white_name: "Ada",
    black_name: "Daniel",
    status: "active",
    turn: chess.turn(),
    fen: chess.fen(),
    ply: sans.length,
    version: sans.length,
    initial_ms: 60_000,
    increment_ms: 0,
    white_ms: 60_000,
    black_ms: 60_000,
    turn_started_at: new Date(NOW).toISOString(),
    result: null,
    result_reason: null,
    draw_offered_by: null,
    rematch_requested_by: null,
    rematch_game_id: null,
    ...overrides,
  } as GameRow;
  return { game, moves };
}

function loaded(player: string, sans: string[]) {
  const store = new OnlineGameStore(player);
  const { game, moves } = server(sans);
  const snapshot: GameSnapshot = { game, moves, serverNow: new Date(NOW).toISOString() };
  store.load(snapshot, NOW, NOW);
  return store;
}

describe("OnlineGameStore", () => {
  it("restores the board, history and colour from a snapshot", () => {
    const store = loaded(BLACK, ["e4", "e5", "Nf3"]);
    const view = store.getView();
    expect(view.myColor).toBe("b");
    expect(view.position.history.map((move) => move.san)).toEqual(["e4", "e5", "Nf3"]);
    expect(view.position.turn).toBe("b");
  });

  it("applies the opponent's next move and ignores duplicates and older versions", () => {
    const store = loaded(BLACK, ["e4"]);
    const next = server(["e4", "e5"]);
    // Black's own move arriving as a broadcast (e.g. from another tab).
    expect(store.apply(next.game, next.moves[1]!)).toBe("applied");
    expect(store.apply(next.game, next.moves[1]!)).toBe("applied");
    expect(store.getView().position.history).toHaveLength(2);

    const older = server(["e4"]);
    expect(store.apply(older.game, null)).toBe("ignored");
    expect(store.getView().position.history).toHaveLength(2);
  });

  it("asks for a resync when an update skips a version", () => {
    const store = loaded(WHITE, []);
    const ahead = server(["e4", "e5"]);
    expect(store.apply(ahead.game, ahead.moves[1]!)).toBe("resync");
  });

  it("keeps a confirmed optimistic move and drops a refused one", () => {
    const store = loaded(WHITE, []);
    expect(store.playOptimistic("e2", "e4", null, "req-1")).toEqual({ expectedVersion: 0 });
    expect(store.getView().pending).toBe(true);
    expect(store.getView().position.turn).toBe("b");

    const confirmed = server(["e4"]);
    expect(store.apply(confirmed.game, confirmed.moves[0]!)).toBe("applied");
    expect(store.getView().pending).toBe(false);
    expect(store.getView().position.history.map((move) => move.san)).toEqual(["e4"]);

    const refused = loaded(WHITE, []);
    refused.playOptimistic("d2", "d4", null, "req-x");
    refused.dropPending("req-x");
    expect(refused.getView().position.history).toHaveLength(0);
  });

  it("keeps an in-flight move when a canonical refresh returns the pre-move position", () => {
    const store = loaded(WHITE, []);
    store.playOptimistic("e2", "e4", null, "req-1");
    store.load({ ...server([]), serverNow: new Date(NOW).toISOString() }, NOW, NOW);
    expect(store.getView().pending).toBe(true);
    expect(store.getView().position.history.map((move) => move.san)).toEqual(["e4"]);
    const committed = server(["e4"]);
    store.apply(committed.game, committed.moves[0]!);
    expect(store.getView().pending).toBe(false);
  });

  it.each(["broadcast", "snapshot"])("keeps the pending move through a metadata-only %s", (source) => {
    const store = loaded(WHITE, []);
    store.playOptimistic("e2", "e4", null, "req-1");
    const update = server([], { version: 1, draw_offered_by: BLACK });
    if (source === "broadcast") store.apply(update.game, null);
    else store.load({ ...update, serverNow: new Date(NOW).toISOString() }, NOW, NOW);
    expect(store.getView().pending).toBe(true);
    expect(store.getView().position.lastMove?.san).toBe("e4");
    expect(store.dropPending("another-request")).toBe(false);
    expect(store.dropPending("req-1")).toBe(true);
    expect(store.getView().position.lastMove).toBeNull();
  });

  it("will not play for the opponent, out of turn, or after the game ends", () => {
    const black = loaded(BLACK, []);
    expect(black.playOptimistic("e7", "e5", null, "r")).toBeNull();

    const white = loaded(WHITE, []);
    expect(white.playOptimistic("e2", "e5", null, "r")).toBeNull();

    const over = loaded(WHITE, []);
    over.apply(server([], { version: 1, status: "finished", result: "black", result_reason: "resignation" }).game, null);
    expect(over.playOptimistic("e2", "e4", null, "r")).toBeNull();
  });

  it("rolls back an optimistic move when the game ends without it", () => {
    const store = loaded(WHITE, []);
    store.playOptimistic("e2", "e4", null, "req-1");
    const flagged = server([], { version: 1, status: "finished", result: "black", result_reason: "timeout" });
    expect(store.apply(flagged.game, null)).toBe("applied");
    expect(store.getView().position.history).toHaveLength(0);
    expect(store.getView().game?.result).toBe("black");
  });

  it("synchronises a promotion", () => {
    const sans = ["a4", "h5", "a5", "h4", "a6", "h3", "axb7", "hxg2"];
    const store = loaded(BLACK, sans);
    const next = server([...sans, "bxa8=Q"]);
    expect(store.apply(next.game, next.moves[8]!)).toBe("applied");
    expect(store.getView().position.pieceAt.a8).toEqual({ color: "w", type: "q" });
  });

  it("derives clocks from server time, not local time", () => {
    const store = new OnlineGameStore(WHITE);
    const { game, moves } = server([], { white_ms: 30_000 });
    // Local clock runs 5 s behind the server.
    store.load({ game, moves, serverNow: new Date(NOW + 2_000).toISOString() }, NOW - 5_000, NOW - 1_000);
    // 10 s of local time later the server is at NOW + 12 s: 12 s used.
    const reading = store.clockReading(NOW - 3_000 + 10_000);
    expect(reading!.w).toBe(18_000);
    expect(reading!.b).toBe(60_000);
  });
});
