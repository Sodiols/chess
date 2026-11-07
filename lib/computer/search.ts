import { Chess, type Move } from "chess.js";
import type { Color, PieceSymbol, Square } from "@/types";

/**
 * Alpha-beta search over chess.js positions. chess.js stays the single source of
 * the rules: this module only decides which legal move to play.
 *
 * chess.js's public `move()` computes SAN for every move, which caps a search
 * at a couple of thousand nodes per second. Its internal make/unmake path is
 * roughly eighty times faster, so it is used when present, with the public API
 * kept as a slower but always-correct fallback.
 */

export interface SearchOptions {
  /** Maximum depth in plies for iterative deepening. */
  depth: number;
  /** Soft time budget; the last fully searched depth is used when it runs out. */
  timeMs: number;
  /** Extend leaf nodes with a capture-only search, so trades are judged whole. */
  quiescence: boolean;
  /** Random centipawns added to each root move's score; makes weaker play human. */
  noise: number;
  /** Chance of playing a uniformly random legal move instead of searching. */
  blunderChance: number;
  random?: () => number;
}

export interface BotMove {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
}

export interface SearchResult extends BotMove {
  score: number;
  depth: number;
  nodes: number;
}

/** Internal move as chess.js stores it: 0x88 squares and bit flags. */
interface RawMove {
  color: Color;
  from: number;
  to: number;
  piece: PieceSymbol;
  captured?: PieceSymbol;
  promotion?: PieceSymbol;
  flags: number;
}

interface Board {
  moves(): RawMove[];
  /** Plays a pseudo-legal move; returns false (and leaves no trace) if it leaves the king in check. */
  make(move: RawMove): boolean;
  undo(): void;
  inCheck(): boolean;
}

const FLAG = { CAPTURE: 2, EP: 8, PROMOTION: 16, KSIDE: 32, QSIDE: 64 } as const;
const VALUE: Record<PieceSymbol, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const MATE = 100_000;
const MAX_QUIESCENCE = 6;

// Piece-square tables from White's side, a8 first (the Simplified Evaluation
// Function). Black reads them mirrored.
const PST: Record<PieceSymbol, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10,
    25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10,
    10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0,
    -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10,
    5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0,
    0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5,
    0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0,
    5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50,
    -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20,
  ],
};

/** 0x88 square → 0..63 with a8 = 0. */
const index = (square: number) => (square >> 4) * 8 + (square & 7);
const toSquare = (square: number) =>
  `${String.fromCharCode(97 + (square & 7))}${8 - (square >> 4)}` as Square;
const fromSquare = (square: Square) => (8 - Number(square[1])) * 16 + (square.charCodeAt(0) - 97);
const pst = (piece: PieceSymbol, color: Color, at: number) => PST[piece][color === "w" ? at : at ^ 56]!;

/** Change in the White-relative evaluation caused by `move`. */
function evalDelta(move: RawMove): number {
  const us = move.color;
  const them: Color = us === "w" ? "b" : "w";
  const from = index(move.from);
  const to = index(move.to);
  const placed = move.promotion ?? move.piece;

  let delta = VALUE[placed] + pst(placed, us, to) - VALUE[move.piece] - pst(move.piece, us, from);
  if (move.captured) {
    const at = move.flags & FLAG.EP ? (us === "w" ? to + 8 : to - 8) : to;
    delta += VALUE[move.captured] + pst(move.captured, them, at);
  }
  const row = from & ~7;
  if (move.flags & FLAG.KSIDE) delta += pst("r", us, row + 5) - pst("r", us, row + 7);
  if (move.flags & FLAG.QSIDE) delta += pst("r", us, row + 3) - pst("r", us, row);
  return us === "w" ? delta : -delta;
}

interface ChessInternals {
  _moves(options: { legal: boolean }): RawMove[];
  _makeMove(move: RawMove): void;
  _undoMove(): unknown;
  _isKingAttacked(color: Color): boolean;
}

function hasInternals(chess: unknown): chess is ChessInternals {
  const candidate = chess as Partial<ChessInternals>;
  return (
    typeof candidate._moves === "function" &&
    typeof candidate._makeMove === "function" &&
    typeof candidate._undoMove === "function" &&
    typeof candidate._isKingAttacked === "function"
  );
}

export function createBoard(chess: Chess, allowInternals = true): Board & { fast: boolean } {
  // Viewed through `unknown` because the real class declares these private.
  const internal: unknown = chess;
  if (allowInternals && hasInternals(internal)) {
    const raw = internal;
    return {
      fast: true,
      moves: () => raw._moves({ legal: false }),
      make(move) {
        raw._makeMove(move);
        if (raw._isKingAttacked(move.color)) {
          raw._undoMove();
          return false;
        }
        return true;
      },
      undo: () => void raw._undoMove(),
      inCheck: () => chess.inCheck(),
    };
  }

  return {
    fast: false,
    moves: () => chess.moves({ verbose: true }).map(fromPublicMove),
    make(move) {
      chess.move({ from: toSquare(move.from), to: toSquare(move.to), promotion: move.promotion });
      return true;
    },
    undo: () => void chess.undo(),
    inCheck: () => chess.inCheck(),
  };
}

function fromPublicMove(move: Move): RawMove {
  let flags = 0;
  if (move.isCapture()) flags |= FLAG.CAPTURE;
  if (move.isEnPassant()) flags |= FLAG.EP;
  if (move.isPromotion()) flags |= FLAG.PROMOTION;
  if (move.isKingsideCastle()) flags |= FLAG.KSIDE;
  if (move.isQueensideCastle()) flags |= FLAG.QSIDE;
  return {
    color: move.color,
    from: fromSquare(move.from),
    to: fromSquare(move.to),
    piece: move.piece,
    captured: move.captured,
    promotion: move.promotion,
    flags,
  };
}

/** Captures first, most valuable victim by least valuable attacker; then promotions. */
function orderScore(move: RawMove): number {
  let score = 0;
  if (move.captured) score += 10 * VALUE[move.captured] - VALUE[move.piece] + 10_000;
  if (move.promotion) score += VALUE[move.promotion] + 9_000;
  return score;
}

function staticEval(chess: Chess): number {
  let score = 0;
  chess.board().forEach((row, r) =>
    row.forEach((cell, f) => {
      if (!cell) return;
      const value = VALUE[cell.type] + pst(cell.type, cell.color, r * 8 + f);
      score += cell.color === "w" ? value : -value;
    }),
  );
  return score;
}

class Abort extends Error {}

class Searcher {
  nodes = 0;
  private evaluation: number;
  private side: 1 | -1;

  constructor(
    private readonly board: Board,
    chess: Chess,
    private readonly deadline: number,
    private readonly quiescence: boolean,
  ) {
    this.evaluation = staticEval(chess);
    this.side = chess.turn() === "w" ? 1 : -1;
  }

  /** Plays a move, keeping the incremental evaluation in step. */
  play(move: RawMove): boolean {
    if (!this.board.make(move)) return false;
    this.evaluation += evalDelta(move);
    this.side = this.side === 1 ? -1 : 1;
    return true;
  }

  takeBack(move: RawMove): void {
    this.board.undo();
    this.evaluation -= evalDelta(move);
    this.side = this.side === 1 ? -1 : 1;
  }

  private tick(): void {
    if ((++this.nodes & 1023) === 0 && Date.now() > this.deadline) throw new Abort();
  }

  /** Score from the side to move's point of view. */
  negamax(depth: number, alpha: number, beta: number, ply: number): number {
    this.tick();
    if (depth <= 0) return this.quiescence ? this.quiesce(alpha, beta, 0) : this.side * this.evaluation;

    const moves = this.board.moves().sort((a, b) => orderScore(b) - orderScore(a));
    let legal = 0;
    for (const move of moves) {
      if (!this.play(move)) continue;
      legal++;
      const score = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
      this.takeBack(move);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    if (legal === 0) return this.board.inCheck() ? -MATE + ply : 0;
    return alpha;
  }

  private quiesce(alpha: number, beta: number, depth: number): number {
    this.tick();
    const standPat = this.side * this.evaluation;
    if (standPat >= beta || depth >= MAX_QUIESCENCE) return standPat;
    if (standPat > alpha) alpha = standPat;

    const moves = this.board
      .moves()
      .filter((move) => move.captured || move.promotion)
      .sort((a, b) => orderScore(b) - orderScore(a));
    for (const move of moves) {
      if (!this.play(move)) continue;
      const score = -this.quiesce(-beta, -alpha, depth + 1);
      this.takeBack(move);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }
}

function toBotMove(move: RawMove): BotMove {
  return {
    from: toSquare(move.from),
    to: toSquare(move.to),
    ...(move.promotion ? { promotion: move.promotion } : {}),
  };
}

/** Picks a move for the side to move, or null when the game is already over. */
export function chooseMove(fen: string, options: SearchOptions): SearchResult | null {
  const random = options.random ?? Math.random;
  const chess = new Chess(fen);
  const board = createBoard(chess);

  const legal = board.moves().filter((move) => {
    if (!board.make(move)) return false;
    board.undo();
    return true;
  });
  if (legal.length === 0) return null;

  if (random() < options.blunderChance) {
    const pick = legal[Math.floor(random() * legal.length)]!;
    return { ...toBotMove(pick), score: 0, depth: 0, nodes: 0 };
  }

  const searcher = new Searcher(board, chess, Date.now() + options.timeMs, options.quiescence);
  // Noise is fixed per move so deeper iterations refine one consistent preference.
  const noise = new Map(legal.map((move) => [move, (random() * 2 - 1) * options.noise]));
  let ordered = [...legal].sort((a, b) => orderScore(b) - orderScore(a));
  let best: { move: RawMove; score: number; depth: number } | null = null;

  for (let depth = 1; depth <= options.depth; depth++) {
    const scored: { move: RawMove; score: number }[] = [];
    try {
      let alpha = -Infinity;
      for (const move of ordered) {
        searcher.play(move);
        // Noisy play needs every root score exact, so it searches a full window;
        // exact play only needs to know whether a move beats the best so far.
        const floor = options.noise > 0 ? -MATE - 1 : alpha;
        const score = -searcher.negamax(depth - 1, -MATE - 1, -floor, 1) + noise.get(move)!;
        searcher.takeBack(move);
        scored.push({ move, score });
        alpha = Math.max(alpha, score);
      }
    } catch (error) {
      if (!(error instanceof Abort)) throw error;
      // The board is mid-search and is discarded; keep the last complete depth.
      break;
    }
    scored.sort((a, b) => b.score - a.score);
    best = { move: scored[0]!.move, score: scored[0]!.score, depth };
    ordered = scored.map((entry) => entry.move);
    // A forced mate needs no deeper look.
    if (Math.abs(best.score) > MATE - 1000) break;
  }

  const chosen = best ?? { move: ordered[0]!, score: 0, depth: 0 };
  return { ...toBotMove(chosen.move), score: Math.round(chosen.score), depth: chosen.depth, nodes: searcher.nodes };
}
