import { Chess, type Move, type Square as ChessSquare } from "chess.js";
import type {
  Color,
  GameResult,
  LegalMove,
  Piece,
  PieceSymbol,
  PlayedMove,
  Square,
} from "@/types";

/**
 * A piece carries a stable `id` across moves so the board can animate it with a
 * persistent DOM node instead of unmounting and remounting on every ply.
 */
interface PositionPiece extends Piece {
  id: string;
  square: Square;
}

export interface Position {
  fen: string;
  turn: Color;
  pieces: PositionPiece[];
  pieceAt: Partial<Record<Square, Piece>>;
  inCheck: boolean;
  /** Square of the king that is currently in check, if any. */
  checkSquare: Square | null;
  movesFrom: Partial<Record<Square, LegalMove[]>>;
  history: PlayedMove[];
  lastMove: PlayedMove | null;
  /** Result reachable from the position alone — mate, stalemate, or an automatic draw. */
  result: GameResult | null;
  moveNumber: number;
  halfMoveClock: number;
}

export function opposite(color: Color): Color {
  return color === "w" ? "b" : "w";
}

/**
 * Wraps chess.js with the derived state the interface needs. Rule enforcement is
 * delegated entirely to the library; this class only shapes and caches results.
 */
export class ChessEngine {
  private chess: Chess;
  private played: PlayedMove[] = [];
  private ids: Partial<Record<Square, string>> = {};
  private idStack: Partial<Record<Square, string>>[] = [];
  private nextId = 0;

  /** An optional FEN starts the engine from a set position instead of a new game. */
  constructor(private readonly startFen?: string) {
    this.chess = new Chess(startFen);
    this.assignInitialIds();
  }

  reset(): void {
    if (this.startFen) this.chess.load(this.startFen);
    else this.chess.reset();
    this.played = [];
    this.ids = {};
    this.idStack = [];
    this.nextId = 0;
    this.assignInitialIds();
  }

  private assignInitialIds(): void {
    for (const row of this.chess.board()) {
      for (const cell of row) {
        if (cell) this.ids[cell.square] = `p${this.nextId++}`;
      }
    }
  }

  /**
   * Applies a move and returns it, or `null` when the move is illegal. Illegal
   * input is expected — Pro mode lets players attempt anything.
   */
  move(from: Square, to: Square, promotion?: PieceSymbol): PlayedMove | null {
    let move: Move;
    try {
      move = this.chess.move({
        from: from as ChessSquare,
        to: to as ChessSquare,
        promotion,
      });
    } catch {
      return null;
    }

    this.idStack.push({ ...this.ids });
    this.trackIds(move);

    const played = toPlayedMove(move);
    this.played.push(played);
    return played;
  }

  /** Moves piece ids alongside the board so animations follow the right nodes. */
  private trackIds(move: Move): void {
    if (move.isEnPassant()) {
      const capturedRank = move.color === "w" ? "5" : "4";
      delete this.ids[`${move.to[0]}${capturedRank}` as Square];
    } else {
      delete this.ids[move.to];
    }

    this.ids[move.to] = this.ids[move.from];
    delete this.ids[move.from];

    if (move.isKingsideCastle() || move.isQueensideCastle()) {
      const rank = move.color === "w" ? "1" : "8";
      const [rookFrom, rookTo] = move.isKingsideCastle()
        ? [`h${rank}`, `f${rank}`]
        : [`a${rank}`, `d${rank}`];
      this.ids[rookTo as Square] = this.ids[rookFrom as Square];
      delete this.ids[rookFrom as Square];
    }
  }

  undo(): PlayedMove | null {
    const move = this.chess.undo();
    if (!move) return null;
    const restored = this.idStack.pop();
    if (restored) this.ids = restored;
    return this.played.pop() ?? null;
  }

  canUndo(): boolean {
    return this.played.length > 0;
  }

  fen(): string {
    return this.chess.fen();
  }

  snapshot(): Position {
    const turn = this.chess.turn();
    const inCheck = this.chess.inCheck();

    return {
      fen: this.chess.fen(),
      turn,
      pieces: this.collectPieces(),
      pieceAt: this.collectPieceMap(),
      inCheck,
      checkSquare: inCheck ? this.kingSquare(turn) : null,
      movesFrom: this.collectLegalMoves(),
      history: [...this.played],
      lastMove: this.played[this.played.length - 1] ?? null,
      result: this.detectResult(),
      moveNumber: this.chess.moveNumber(),
      halfMoveClock: Number(this.chess.fen().split(" ")[4] ?? 0),
    };
  }

  private kingSquare(color: Color): Square | null {
    return this.chess.findPiece({ color, type: "k" })[0] ?? null;
  }

  private collectPieces(): PositionPiece[] {
    const pieces: PositionPiece[] = [];
    for (const row of this.chess.board()) {
      for (const cell of row) {
        if (!cell) continue;
        // A piece placed outside the engine's own move tracking has no id yet.
        const id = (this.ids[cell.square] ??= `p${this.nextId++}`);
        pieces.push({ id, square: cell.square, color: cell.color, type: cell.type });
      }
    }
    return pieces;
  }

  private collectPieceMap(): Partial<Record<Square, Piece>> {
    const map: Partial<Record<Square, Piece>> = {};
    for (const row of this.chess.board()) {
      for (const cell of row) {
        if (cell) map[cell.square] = { color: cell.color, type: cell.type };
      }
    }
    return map;
  }

  /**
   * Groups legal moves by origin square, collapsing the four promotion variants
   * of a single pawn push into one destination.
   */
  private collectLegalMoves(): Partial<Record<Square, LegalMove[]>> {
    const grouped: Partial<Record<Square, LegalMove[]>> = {};

    for (const move of this.chess.moves({ verbose: true })) {
      const list = (grouped[move.from] ??= []);
      if (move.isPromotion() && list.some((existing) => existing.to === move.to)) {
        continue;
      }
      list.push({
        from: move.from,
        to: move.to,
        isCapture: isCapture(move),
        isEnPassant: move.isEnPassant(),
        isCastle: move.isKingsideCastle() || move.isQueensideCastle(),
        isPromotion: move.isPromotion(),
        captureSquare: isCapture(move) ? captureSquareOf(move) : undefined,
      });
    }

    return grouped;
  }

  private detectResult(): GameResult | null {
    return detectResult(this.chess);
  }

  /** Exposed for analysis helpers that need to inspect attacks and rays. */
  raw(): Chess {
    return this.chess;
  }
}

/** Result reachable from the position alone. Shared with the server move validator. */
export function detectResult(chess: Chess): GameResult | null {
  if (chess.isCheckmate()) {
    return { kind: "win", winner: opposite(chess.turn()), reason: "checkmate" };
  }
  if (chess.isStalemate()) return { kind: "draw", reason: "stalemate" };
  if (chess.isInsufficientMaterial()) return { kind: "draw", reason: "insufficient-material" };
  if (chess.isThreefoldRepetition()) return { kind: "draw", reason: "threefold-repetition" };
  if (chess.isDrawByFiftyMoves()) return { kind: "draw", reason: "fifty-move-rule" };
  return null;
}

/**
 * chess.js flags en passant with `e` alone, so its `isCapture()` returns false
 * for it. Everything above this layer should treat it as the capture it is.
 */
function isCapture(move: Move): boolean {
  return move.isCapture() || move.isEnPassant();
}

function captureSquareOf(move: Move): Square {
  if (!move.isEnPassant()) return move.to;
  const rank = move.color === "w" ? "5" : "4";
  return `${move.to[0]}${rank}` as Square;
}

function toPlayedMove(move: Move): PlayedMove {
  return {
    san: move.san,
    from: move.from,
    to: move.to,
    color: move.color,
    piece: move.piece,
    captured: move.captured,
    promotion: move.promotion,
    isCapture: isCapture(move),
    isEnPassant: move.isEnPassant(),
    isCastle: move.isKingsideCastle() || move.isQueensideCastle(),
    // A mating move is also a checking move, so `#` satisfies both.
    isCheck: move.san.endsWith("+") || move.san.endsWith("#"),
    isCheckmate: move.san.endsWith("#"),
  };
}
