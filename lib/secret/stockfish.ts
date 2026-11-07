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

/** Parses one `info ... pv ...` line. Bound-only scores (mid-aspiration-window) are skipped. */
export function parseInfo(line: string): (EngineLine & { nodes: number; nps: number; time: number }) | null {
  if (!line.startsWith("info ") || !line.includes(" pv ") || /\b(lowerbound|upperbound)\b/.test(line)) return null;
  const tokens = line.split(" ");
  const num = (key: string) => {
    const at = tokens.indexOf(key);
    return at === -1 ? NaN : Number(tokens[at + 1]);
  };
  const scoreAt = tokens.indexOf("score");
  if (scoreAt === -1) return null;
  const kind = tokens[scoreAt + 1];
  const value = Number(tokens[scoreAt + 2]);
  if (!Number.isFinite(value) || (kind !== "cp" && kind !== "mate")) return null;
  const pv = tokens.slice(tokens.indexOf("pv") + 1).filter(Boolean);
  if (pv.length === 0) return null;
  return {
    multipv: num("multipv") || 1,
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
  private ready = false;
  private hashMb = 16;
  private job: Job | null = null;
  private next: Job | null = null;

  constructor(private readonly onError: (message: string) => void) {
    // WebAssembly build where available; the (slow) asm.js build otherwise.
    const file = typeof WebAssembly === "object" ? "stockfish-19-lite-single.js" : "stockfish-19-asm.js";
    this.worker = new Worker(`/engine/${file}`);
    this.worker.onmessage = (event: MessageEvent<string>) => this.receive(String(event.data));
    this.worker.onerror = () => this.onError("The analysis engine failed to load.");
    this.send("uci");
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
      this.send("stop");
    } else {
      this.startNext();
    }
    return () => {
      job.cancelled = true;
      if (this.next === job) this.next = null;
      if (this.job === job) this.send("stop");
    };
  }

  /** Ends the current search early but keeps (and reports) what it found. */
  stop(): void {
    if (this.job && !this.job.cancelled) this.send("stop");
  }

  dispose(): void {
    if (this.job) this.job.cancelled = true;
    this.next = null;
    this.worker.terminate();
  }

  private send(command: string) {
    this.worker.postMessage(command);
  }

  private startNext() {
    const job = this.next;
    if (!job || !this.ready) return;
    this.next = null;
    this.job = job;
    const { hashMb, movetimeMs } = STRENGTHS[job.strength];
    if (hashMb !== this.hashMb) {
      this.send(`setoption name Hash value ${hashMb}`);
      this.hashMb = hashMb;
    }
    this.send(`position fen ${job.fen}`);
    this.send(`go movetime ${movetimeMs}`);
  }

  private receive(line: string) {
    if (line === "uciok") {
      this.send(`setoption name MultiPV value ${MULTI_PV}`);
      this.ready = true;
      this.startNext();
      return;
    }

    const job = this.job;
    if (!job) return;

    if (line.startsWith("bestmove")) {
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
