import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createDatabase, createUser, rpc } from "./db/harness";
import { DEFAULT_SECRET_SETTINGS, sanitizeSecretSettings } from "@/lib/secret/settings";
import { parseInfo } from "@/lib/secret/stockfish";
import { explainLine, findThreats, formatLine, formatScore, playUci } from "@/lib/secret/insights";

interface Result {
  ok: boolean;
  error?: string;
  owner?: boolean;
  settings?: Record<string, unknown>;
}

const OWNER_EMAIL = "itssayem2023@gmail.com";
let db: PGlite;

beforeAll(async () => {
  db = await createDatabase();
}, 60_000);

async function account(email: string, confirmed: boolean): Promise<string> {
  const id = await createUser(db);
  await db.query("update auth.users set email = $2, email_confirmed_at = $3 where id = $1", [
    id,
    email,
    confirmed ? new Date().toISOString() : null,
  ]);
  return id;
}

describe("owner authorisation (database)", () => {
  it("recognises only the confirmed owner account", async () => {
    const owner = await account("ItsSayem2023@gmail.com", true);
    const unconfirmed = await account(OWNER_EMAIL, false);
    const other = await account("someone@example.com", true);

    expect(await rpc<Result>(db, "get_owner_settings", [owner])).toMatchObject({ ok: true, owner: true });
    expect(await rpc<Result>(db, "get_owner_settings", [unconfirmed])).toEqual({ ok: true, owner: false });
    expect(await rpc<Result>(db, "get_owner_settings", [other])).toEqual({ ok: true, owner: false });
  });

  it("persists the owner's settings and refuses everyone else's writes", async () => {
    const owner = await account(OWNER_EMAIL, true);
    const other = await account("intruder@example.com", true);
    const saved = { ...DEFAULT_SECRET_SETTINGS, enabled: true, strength: "deep" };

    expect(await rpc<Result>(db, "set_owner_settings", [owner, JSON.stringify(saved)])).toMatchObject({ ok: true });
    expect((await rpc<Result>(db, "get_owner_settings", [owner])).settings).toEqual(saved);

    expect(await rpc<Result>(db, "set_owner_settings", [other, JSON.stringify(saved)])).toEqual({
      ok: false,
      error: "not_owner",
    });
    const { rows } = await db.query("select 1 from public.owner_settings where user_id = $1", [other]);
    expect(rows).toHaveLength(0);
  });

  it("gives browser roles no access to the table or the functions", async () => {
    const owner = await account(OWNER_EMAIL, true);
    await expect(asUser(db, owner, "select * from public.owner_settings")).rejects.toThrow(/permission denied/);
    await expect(asUser(db, owner, "select public.get_owner_settings($1)", [owner])).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, owner, "select public.set_owner_settings($1, '{}'::jsonb)", [owner]),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("settings sanitising", () => {
  it("keeps known keys of the right type only", () => {
    expect(sanitizeSecretSettings({ enabled: true, strength: "max", arrows: "yes", evil: 1 })).toEqual({
      ...DEFAULT_SECRET_SETTINGS,
      enabled: true,
      strength: "max",
    });
    expect(sanitizeSecretSettings(null)).toEqual(DEFAULT_SECRET_SETTINGS);
    expect(DEFAULT_SECRET_SETTINGS.enabled).toBe(false);
  });
});

describe("UCI parsing", () => {
  it("reads score, depth, nodes and pv", () => {
    const line = parseInfo(
      "info depth 18 seldepth 24 multipv 2 score cp -35 nodes 1234567 nps 900000 hashfull 100 tbhits 0 time 1371 pv d7d5 e4d5 d8d5",
    );
    expect(line).toEqual({
      multipv: 2,
      depth: 18,
      score: { cp: -35 },
      pv: ["d7d5", "e4d5", "d8d5"],
      nodes: 1234567,
      nps: 900000,
      time: 1371,
    });
    expect(parseInfo("info depth 5 multipv 1 score mate -3 nodes 10 time 1 pv h7h8")?.score).toEqual({ mate: -3 });
    expect(parseInfo("info depth 12 score cp 20 lowerbound nodes 5 pv e2e4")).toBeNull();
    expect(parseInfo("info string NNUE loaded")).toBeNull();
  });
});

describe("engine line helpers", () => {
  const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  it("converts UCI to SAN in the right position and stops at an illegal move", () => {
    expect(playUci(start, ["g1f3", "b8c6", "d2d4"]).map((m) => m.san)).toEqual(["Nf3", "Nc6", "d4"]);
    expect(playUci(start, ["e2e4", "e2e4"]).map((m) => m.san)).toEqual(["e4"]);
    expect(formatLine(start, playUci(start, ["g1f3", "b8c6", "d2d4"]))).toBe("1. Nf3 Nc6 2. d4");
    const black = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    expect(formatLine(black, playUci(black, ["e7e5", "g1f3"]))).toBe("1… e5 2. Nf3");
  });

  it("shows scores from white's point of view", () => {
    expect(formatScore({ cp: 85 }, "w")).toBe("+0.85");
    expect(formatScore({ cp: 85 }, "b")).toBe("−0.85");
    expect(formatScore({ mate: 3 }, "b")).toBe("#−3");
  });

  it("explains only what the move does", () => {
    const text = explainLine(start, { multipv: 1, depth: 10, score: { cp: 30 }, pv: ["g1f3"] });
    expect(text).toBe("Develops the knight toward the centre.");
  });

  it("finds hanging pieces and forks for the side to move", () => {
    // The black knight on c2 forks the white rooks on a1 and e1.
    const fork = findThreats("4k3/8/8/8/8/8/2n5/R3R1K1 w - - 0 1");
    expect(fork.warnings.some((w) => w.startsWith("Fork: the knight on c2"))).toBe(true);
    // The white queen on d4 is attacked by a pawn.
    const hanging = findThreats("4k3/8/8/4p3/3Q4/8/8/4K3 w - - 0 1");
    expect(hanging.squares).toContain("d4");
  });
});

describe("StockfishClient", () => {
  class FakeWorker {
    static last: FakeWorker;
    sent: string[] = [];
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() {
      FakeWorker.last = this;
    }
    postMessage(command: string) {
      this.sent.push(command);
    }
    terminate() {}
    say(line: string) {
      this.onmessage?.({ data: line });
    }
  }

  async function client() {
    vi.stubGlobal("Worker", FakeWorker);
    const { StockfishClient } = await import("@/lib/secret/stockfish");
    const engine = new StockfishClient(() => {});
    const worker = FakeWorker.last;
    worker.say("uciok");
    expect(worker.sent).toContain("isready");
    worker.say("readyok");
    return { engine, worker };
  }

  it("fails if the worker never acknowledges readiness", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal("Worker", FakeWorker);
      const { StockfishClient } = await import("@/lib/secret/stockfish");
      const fail = vi.fn();
      const engine = new StockfishClient(fail);
      FakeWorker.last.say("uciok");
      engine.analyze("fen", "quick", vi.fn());
      expect(FakeWorker.last.sent.some((command) => command.startsWith("go"))).toBe(false);
      vi.advanceTimersByTime(15_000);
      expect(fail).toHaveBeenCalledWith("The analysis engine did not become ready.");
    } finally {
      vi.useRealTimers();
    }
  });

  it("never reports a stopped search's output for the new position", async () => {
    const { engine, worker } = await client();
    const first: string[] = [];
    const second: EngineUpdateLike[] = [];
    engine.analyze("fen-one", "quick", (u) => first.push(u.fen));
    engine.analyze("fen-two", "quick", (u) => second.push(u));

    // The second search waits for the first to confirm its stop.
    expect(worker.sent.filter((c) => c.startsWith("position"))).toEqual(["position fen fen-one"]);
    expect(worker.sent).toContain("stop");
    worker.say("info depth 9 multipv 1 score cp 50 nodes 1 time 1 pv e2e4"); // late output of search one
    worker.say("bestmove e2e4");
    expect(first).toEqual([]);
    expect(worker.sent.at(-2)).toBe("position fen fen-two");

    worker.say("info depth 3 multipv 1 score cp 10 nodes 1 time 1 pv d2d4");
    worker.say("bestmove d2d4");
    expect(second.at(-1)).toMatchObject({ fen: "fen-two", done: true, lines: [{ pv: ["d2d4"] }] });
  });

  it("drops a leftover slot that repeats a newer line's move", async () => {
    const { engine, worker } = await client();
    let last: EngineUpdateLike | null = null;
    engine.analyze("fen", "quick", (u) => (last = u));
    worker.say("info depth 10 multipv 1 score cp 30 nodes 1 time 1 pv d2d4");
    worker.say("info depth 10 multipv 2 score cp 20 nodes 1 time 1 pv e2e4");
    worker.say("info depth 11 multipv 1 score cp 25 nodes 1 time 1 pv e2e4");
    worker.say("bestmove e2e4");
    const firstMoves = last!.lines.filter(Boolean).map((line) => line!.pv[0]);
    expect(firstMoves).toEqual(["e2e4"]);
  });
});

type EngineUpdateLike = import("@/lib/secret/stockfish").EngineUpdate;
