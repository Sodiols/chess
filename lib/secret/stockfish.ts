import type { AnalysisStrength } from "./settings";

/** A score as UCI reports it: from the side to move's point of view. */
export type EngineScore = { cp: number } | { mate: number };

export interface EngineLine {
  multipv: number;
  depth: number;
  score: EngineScore;
  /** UCI moves, e.g. "e2e4", "e7e8q". */
  pv: string[];
}

export interface EngineUpdate {
  fen: string;
  /** Indexed by multipv - 1; a slot can be empty for a moment mid-search. */
  lines: (EngineLine | undefined)[];
  depth: number;
  nodes: number;
  nps: number;
  timeMs: number;
  movetimeMs: number;
  done: boolean;
}

/** Search limits per strength. `max` is still bounded so a phone or laptop never runs flat out forever. */
export const STRENGTHS: Record<AnalysisStrength, { label: string; movetimeMs: number; hashMb: number }> = {
  quick: { label: "Quick", movetimeMs: 1_500, hashMb: 16 },
  deep: { label: "Deep", movetimeMs: 6_000, hashMb: 64 },
  max: { label: "Maximum", movetimeMs: 20_000, hashMb: 128 },
};

const MULTI_PV = 3;
/** Info lines arrive many times a second; React only needs a few. */
const UPDATE_INTERVAL_MS = 120;
const STARTUP_TIMEOUT_MS = 15_000;
const SEARCH_GRACE_MS = 8_000;
const STOP_TIMEOUT_MS = 5_000;

/** Parses one `info ... pv ...` line. Bound-only scores (mid-aspiration-window) are skipped. */
export function parseInfo(line: string): (EngineLine & { nodes: number; nps: number; time: number }) | null {
  const tokens = line.trim().split(/\s+/);
  const pvAt = tokens.indexOf("pv");
  if (tokens[0] !== "info" || pvAt < 0 || tokens.includes("lowerbound") || tokens.includes("upperbound")) return null;
  const num = (key: string) => {
    const at = tokens.indexOf(key);
    return at === -1 ? NaN : Number(tokens[at + 1]);
  };
  const scoreAt = tokens.indexOf("score");
  if (scoreAt === -1) return null;
  const kind = tokens[scoreAt + 1];
  const value = Number(tokens[scoreAt + 2]);
  if (!Number.isFinite(value) || (kind !== "cp" && kind !== "mate")) return null;
  const pv = tokens.slice(pvAt + 1);
  const multipv = num("multipv") || 1;
  if (!Number.isInteger(multipv) || multipv < 1 || multipv > MULTI_PV
    || pv.length === 0 || pv.some((move) => !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))) return null;
  return {
    multipv,
    depth: num("depth") || 0,
    score: kind === "cp" ? { cp: value } : { mate: value },
    pv,
    nodes: num("nodes") || 0,
    nps: num("nps") || 0,
    time: num("time") || 0,
  };
}

interface Job {
  fen: string;
  strength: AnalysisStrength;
  onUpdate: (update: EngineUpdate) => void;
  /** Discarded: nothing more is reported, even the final bestmove. */
  cancelled: boolean;
  update: EngineUpdate;
  lastEmit: number;
}

export function engineSupported(): boolean {
  return typeof Worker !== "undefined";
}

/**
 * One Stockfish worker speaking UCI. Only one search runs at a time: a new
 * request stops the current one, and the next search starts only after the
 * engine confirms the stop with `bestmove`, so output from an old position can
 * never be attributed to a new one.
 */
export class StockfishClient {
  private worker: Worker;
  private stage: "uci" | "ready-check" | "ready" | "closed" = "uci";
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private stopping = false;
  private hashMb = 16;
  private job: Job | null = null;
  private next: Job | null = null;

  constructor(private readonly onError: (message: string) => void) {
    // WebAssembly build where available; the (slow) asm.js build otherwise.
    const file = typeof WebAssembly === "object" ? "stockfish-19-lite-single.js" : "stockfish-19-asm.js";
    this.worker = new Worker(`/engine/${file}`);
    this.worker.onmessage = (event: MessageEvent<unknown>) => {
      if (typeof event.data !== "string") return;
      for (const line of event.data.split(/\r?\n/)) this.receive(line.trim());
    };
    this.worker.onerror = () => this.fail("The analysis engine could not load or stopped unexpectedly.");
    this.worker.onmessageerror = () => this.fail("The analysis engine sent an unreadable response.");
    this.armTimeout(STARTUP_TIMEOUT_MS, "The analysis engine did not become ready.");
    this.send("uci");
    this.diagnostic("worker created");
  }

  /** Analyses `fen`, replacing any search in progress. Returns a function that discards this request. */
  analyze(fen: string, strength: AnalysisStrength, onUpdate: (update: EngineUpdate) => void): () => void {
    const job: Job = {
      fen,
      strength,
      onUpdate,
      cancelled: false,
      lastEmit: 0,
      update: { fen, lines: [], depth: 0, nodes: 0, nps: 0, timeMs: 0, movetimeMs: STRENGTHS[strength].movetimeMs, done: false },
    };
    if (this.next) this.next.cancelled = true;
    this.next = job;
    if (this.job) {
      this.job.cancelled = true;
      this.requestStop();
    } else {
      this.startNext();
    }
    return () => {
      job.cancelled = true;
      if (this.next === job) this.next = null;
      if (this.job === job) this.requestStop();
    };
  }

  /** Ends the current search early but keeps (and reports) what it found. */
  stop(): void {
    if (this.job && !this.job.cancelled) this.requestStop();
  }

  dispose(): void {
    if (this.stage === "closed") return;
    this.stage = "closed";
    clearTimeout(this.timeout);
    this.job = null;
    this.next = null;
    this.worker.terminate();
  }

  private send(command: string) {
    if (this.stage === "closed") return;
    try {
      this.worker.postMessage(command);
    } catch {
      this.fail("The browser could not send a command to the analysis engine.");
    }
  }

  private diagnostic(event: string) {
    if (process.env.NODE_ENV === "development") console.debug("[gambit coach]", event);
  }

  private armTimeout(ms: number, message: string) {
    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => this.fail(message), ms);
  }

  private fail(message: string) {
    if (this.stage === "closed") return;
    this.diagnostic(`${this.stage}: ${message}`);
    this.dispose();
    this.onError(message);
  }

  private requestStop() {
    if (this.stopping) return;
    this.stopping = true;
    this.armTimeout(STOP_TIMEOUT_MS, "The analysis engine did not stop.");
    this.send("stop");
  }

  private startNext() {
    const job = this.next;
    if (!job || this.stage !== "ready") return;
    this.next = null;
    this.job = job;
    const { hashMb, movetimeMs } = STRENGTHS[job.strength];
    if (hashMb !== this.hashMb) {
      this.send(`setoption name Hash value ${hashMb}`);
      this.hashMb = hashMb;
    }
    this.armTimeout(movetimeMs + SEARCH_GRACE_MS, "The analysis engine did not finish the search.");
    this.send(`position fen ${job.fen}`);
    this.send(`go movetime ${movetimeMs}`);
  }

  private receive(line: string) {
    if (line === "uciok" && this.stage === "uci") {
      this.stage = "ready-check";
      this.diagnostic("UCI initialized");
      this.send(`setoption name MultiPV value ${MULTI_PV}`);
      this.send("isready");
      return;
    }
    if (line === "readyok" && this.stage === "ready-check") {
      this.stage = "ready";
      clearTimeout(this.timeout);
      this.diagnostic("ready");

      this.startNext();
      return;
    }

    const job = this.job;
    if (!job) return;

    if (line.startsWith("bestmove ")) {
      clearTimeout(this.timeout);
      this.stopping = false;
      this.job = null;
      if (!job.cancelled) job.onUpdate({ ...job.update, done: true });
      this.startNext();
      return;
    }

    if (job.cancelled) return;
    const info = parseInfo(line);
    if (!info) return;
    // A slot left over from the previous depth may hold the same move; the newer report wins.
    const lines = job.update.lines.map((line) =>
      line && line.multipv !== info.multipv && line.pv[0] === info.pv[0] ? undefined : line,
    );
    lines[info.multipv - 1] = { multipv: info.multipv, depth: info.depth, score: info.score, pv: info.pv };
    job.update = {
      ...job.update,
      lines,
      depth: Math.max(job.update.depth, info.depth),
      nodes: info.nodes,
      nps: info.nps,
      timeMs: info.time,
    };
    const now = Date.now();
    if (now - job.lastEmit >= UPDATE_INTERVAL_MS) {
      job.lastEmit = now;
      job.onUpdate(job.update);
    }
  }
}
