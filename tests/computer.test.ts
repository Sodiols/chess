import { describe, expect, it, vi } from "vitest";
import { Chess } from "chess.js";
import { chooseMove, createBoard, type SearchOptions } from "@/lib/computer/search";
import { BOT_DIFFICULTIES, BOT_DIFFICULTY_ORDER } from "@/lib/computer/difficulty";
import { BotClient } from "@/lib/computer/botClient";

/** Deterministic PRNG (mulberry32) so difficulty comparisons don't flake. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function options(difficulty: keyof typeof BOT_DIFFICULTIES, seed = 1): SearchOptions {
  return { ...BOT_DIFFICULTIES[difficulty].search, random: seeded(seed) };
}

function isLegal(fen: string, move: { from: string; to: string; promotion?: string }) {
  try {
    new Chess(fen).move(move);
    return true;
  } catch {
    return false;
  }
}

const POSITIONS = [
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
  // Castling both ways and en passant (d5 pawn can take e6).
  "r3k2r/pppq1ppp/2n2n2/3Pp3/1b6/2N2N2/PPPQ1PPP/R3K2R w KQkq e6 0 9",
  "8/P5k1/8/8/8/8/6K1/8 w - - 0 1",
];

// Each hangs a queen to a one-move capture.
const HANGING = [
  "rnb1kbnr/pppp1ppp/8/4p1q1/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 3",
  "rnbqkb1r/pppp1ppp/5n2/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 0 3",
  "rnbqkbnr/ppp2ppp/8/3pp3/4P1Q1/8/PPPP1PPP/RNB1KBNR b KQkq - 0 3",
  "rnb1kbnr/pppp1ppp/8/4p3/4P2q/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3",
];

describe("computer opponent", () => {
  it.each(BOT_DIFFICULTY_ORDER)("plays only legal moves at %s", (difficulty) => {
    for (const [index, fen] of POSITIONS.entries()) {
      const move = chooseMove(fen, options(difficulty, index + 7));
      expect(move, fen).not.toBeNull();
      expect(isLegal(fen, move!), `${fen} ${move!.from}${move!.to}`).toBe(true);
    }
  }, 30_000);

  it("has nothing to play once the game is over", () => {
    const mated = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";
    const stalemate = "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1";
    for (const difficulty of BOT_DIFFICULTY_ORDER) {
      expect(chooseMove(mated, options(difficulty))).toBeNull();
      expect(chooseMove(stalemate, options(difficulty))).toBeNull();
    }
  }, 30_000);

  it("promotes a pawn, to a queen when it matters", () => {
    const move = chooseMove("8/P5k1/8/8/8/8/6K1/8 w - - 0 1", options("pro"));
    expect(move).toMatchObject({ from: "a7", to: "a8", promotion: "q" });
  }, 30_000);

  it("finds mate in one at medium and pro", () => {
    const fen = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";
    for (const difficulty of ["medium", "pro"] as const) {
      expect(chooseMove(fen, options(difficulty))).toMatchObject({ from: "a1", to: "a8" });
    }
  }, 30_000);

  it("finds a mate in two that the beginner cannot see", () => {
    // 1.Rd8+ Rxd8 2.Rxd8#. Proving it takes four plies.
    const fen = "2r3k1/5ppp/8/8/8/8/3R1PPP/3R2K1 w - - 0 1";
    const pro = chooseMove(fen, options("pro"));
    expect(pro).toMatchObject({ from: "d2", to: "d8" });
    expect(pro!.score).toBeGreaterThan(90_000);
    const beginner = chooseMove(fen, { ...options("beginner"), blunderChance: 0 });
    expect(beginner!.score).toBeLessThan(10_000);
  }, 30_000);

  it("wins hanging queens more reliably as difficulty rises", () => {
    const takesQueen = (fen: string, move: { to: string }) => new Chess(fen).get(move.to as "a1")?.type === "q";
    // Pro has no randomness, so one pass is the whole story.
    for (const fen of HANGING) expect(takesQueen(fen, chooseMove(fen, options("pro"))!), fen).toBe(true);

    let beginnerHits = 0;
    for (let seed = 1; seed <= 8; seed++) {
      for (const fen of HANGING) if (takesQueen(fen, chooseMove(fen, options("beginner", seed))!)) beginnerHits++;
    }
    expect(beginnerHits).toBeLessThan(HANGING.length * 8);
    expect(beginnerHits).toBeGreaterThan(0);
  }, 30_000);

  it("searches deeper and wider at higher difficulty", () => {
    const fen = POSITIONS[1]!;
    const medium = chooseMove(fen, options("medium"))!;
    const pro = chooseMove(fen, options("pro"))!;
    expect(pro.depth).toBeGreaterThan(medium.depth);
    expect(pro.nodes).toBeGreaterThan(medium.nodes);
  }, 30_000);

  it("agrees with chess.js's public API when using its fast internal path", () => {
    for (const fen of POSITIONS) {
      const fast = createBoard(new Chess(fen));
      const safe = createBoard(new Chess(fen), false);
      expect(fast.fast).toBe(true);
      const legal = (board: typeof fast) =>
        board
          .moves()
          .filter((move) => board.make(move) && (board.undo(), true))
          .map((move) => `${move.from}-${move.to}-${move.promotion ?? ""}-${move.flags & 0b1111010}`)
          .sort();
      expect(legal(fast)).toEqual(legal(safe));
    }
  });
});

describe("BotClient", () => {
  class FakeWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: (() => void) | null = null;
    posted: { id: number; fen: string }[] = [];
    terminated = false;
    postMessage(message: { id: number; fen: string }) {
      this.posted.push(message);
    }
    terminate() {
      this.terminated = true;
    }
    reply(id: number, move: unknown) {
      this.onmessage?.({ data: { id, move } } as MessageEvent);
    }
  }

  it("delivers the answer to the current request", async () => {
    const worker = new FakeWorker();
    const client = new BotClient(() => worker as unknown as Worker);
    const { promise } = client.request("fen-1", "medium");
    worker.reply(worker.posted[0]!.id, { from: "e2", to: "e4" });
    await expect(promise).resolves.toEqual({ from: "e2", to: "e4" });
  });

  it("cancels by terminating the worker and ignores the stale reply", async () => {
    const workers: FakeWorker[] = [];
    const factory = vi.fn(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    });
    const client = new BotClient(factory);

    const first = client.request("fen-1", "pro");
    first.cancel();
    await expect(first.promise).resolves.toBeNull();
    expect(workers[0]!.terminated).toBe(true);

    const second = client.request("fen-2", "pro");
    // A late reply from the dead request's id must not resolve the new one.
    workers[1]!.reply(workers[0]!.posted[0]!.id, { from: "a2", to: "a3" });
    workers[1]!.reply(workers[1]!.posted[0]!.id, { from: "g1", to: "f3" });
    await expect(second.promise).resolves.toEqual({ from: "g1", to: "f3" });
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("supersedes an older request when a new one is made", async () => {
    const worker = new FakeWorker();
    const client = new BotClient(() => worker as unknown as Worker);
    const first = client.request("fen-1", "beginner");
    client.request("fen-2", "beginner");
    await expect(first.promise).resolves.toBeNull();
  });
});
