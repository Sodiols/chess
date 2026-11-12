import { ChessEngine, type Position } from "@/lib/chess/engine";
import type { Color, PieceSymbol, Square } from "@/types";
import { colorOf, type GameRow, type GameSnapshot, type MoveRow } from "./types";

interface PendingMove {
  requestId: string;
  from: Square;
  to: Square;
  promotion: PieceSymbol | null;
}

export interface OnlineGameView {
  game: GameRow | null;
  position: Position;
  myColor: Color | null;
  /** True while our own move is shown but not yet confirmed by the server. */
  pending: boolean;
}

export type ApplyOutcome = "applied" | "ignored" | "resync";

/**
 * Client mirror of one online game. The server's row and move list are the
 * truth; the local engine only exists to render them, plus at most one
 * optimistic move of our own that is dropped the moment the server disagrees.
 *
 * Updates may arrive duplicated, late or out of order (Realtime broadcast and
 * the HTTP response race each other). Each update carries the row's version, so
 * anything older is ignored, anything contiguous is applied, and any gap asks
 * the caller to refetch the canonical state.
 */
export class OnlineGameStore {
  private engine = new ChessEngine();
  private game: GameRow | null = null;
  private moves: MoveRow[] = [];
  private pendingMove: PendingMove | null = null;
  private listeners = new Set<() => void>();
  private view: OnlineGameView;
  /** Server clock minus local clock, in ms. */
  offsetMs = 0;

  constructor(private readonly playerId: string) {
    this.view = this.buildView();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getView = (): OnlineGameView => this.view;

  getGame(): GameRow | null {
    return this.game;
  }

  syncClock(serverNow: string, requestStartedAt: number, receivedAt: number): void {
    // Approximate the server timestamp as the midpoint of the round trip.
    this.offsetMs = Date.parse(serverNow) - (requestStartedAt + receivedAt) / 2;
  }

  /** Replaces everything with a freshly fetched canonical snapshot. */
  load(snapshot: GameSnapshot, requestStartedAt: number, receivedAt: number): void {
    this.syncClock(snapshot.serverNow, requestStartedAt, receivedAt);
    if (this.game && snapshot.game.version < this.game.version) return;
    this.game = snapshot.game;
    this.moves = [...snapshot.moves].sort((a, b) => a.ply - b.ply);
    this.pendingMove = null;
    this.rebuild();
  }

  apply(game: GameRow, move: MoveRow | null): ApplyOutcome {
    const current = this.game;
    if (!current || game.id !== current.id) return "resync";
    if (game.version < current.version) return "ignored";

    if (game.version === current.version) {
      // Same position; only offers or rematch state can differ.
      this.game = game;
      this.emit();
      return "applied";
    }
    if (game.version !== current.version + 1) return "resync";

    if (game.ply === this.moves.length + 1) {
      if (!move || move.ply !== game.ply) return "resync";
      this.moves.push(move);
      this.game = game;

      const pending = this.pendingMove;
      this.pendingMove = null;
      if (pending && pending.requestId === move.request_id) {
        // Our optimistic move confirmed; the engine already shows it.
        this.emit();
        return "applied";
      }
      if (pending || !this.engine.move(move.from_sq, move.to_sq, move.promotion ?? undefined)) {
        this.rebuild();
        return "applied";
      }
      this.emit();
      return "applied";
    }

    if (game.ply === this.moves.length) {
      // A result without a move: resignation, agreement or a flag.
      this.game = game;
      if (this.pendingMove) {
        this.pendingMove = null;
        this.rebuild();
      } else {
        this.emit();
      }
      return "applied";
    }

    return "resync";
  }

  /**
   * Shows our move immediately. Returns what the server needs to commit it, or
   * null when it isn't ours to make.
   */
  playOptimistic(
    from: Square,
    to: Square,
    promotion: PieceSymbol | null,
    requestId: string,
  ): { expectedVersion: number } | null {
    const game = this.game;
    if (!game || game.status !== "active" || game.paused_at || this.pendingMove) return null;
    if (game.turn !== colorOf(game, this.playerId)) return null;
    if (!this.engine.move(from, to, promotion ?? undefined)) return null;

    this.pendingMove = { requestId, from, to, promotion };
    this.emit();
    return { expectedVersion: game.version };
  }

  /** The server refused our move; show its position again. */
  dropPending(): void {
    if (!this.pendingMove) return;
    this.pendingMove = null;
    this.rebuild();
  }

  hasPending(): boolean {
    return this.pendingMove !== null;
  }

  /** Remaining time per side right now, as the server would compute it. */
  clockReading(now = Date.now()): Record<Color, number> | null {
    const game = this.game;
    if (!game) return null;
    const remaining = { w: game.white_ms, b: game.black_ms };
    if (game.status === "active") {
      const elapsed = (game.paused_at ? Date.parse(game.paused_at) : now + this.offsetMs) - Date.parse(game.turn_started_at);
      remaining[game.turn] = Math.max(0, remaining[game.turn] - Math.max(0, elapsed));
    }
    return remaining;
  }

  private rebuild(): void {
    this.engine = new ChessEngine();
    for (const move of this.moves) {
      this.engine.move(move.from_sq, move.to_sq, move.promotion ?? undefined);
    }
    this.emit();
  }

  private buildView(): OnlineGameView {
    return {
      game: this.game,
      position: this.engine.snapshot(),
      myColor: this.game ? colorOf(this.game, this.playerId) : null,
      pending: this.pendingMove !== null,
    };
  }

  private emit(): void {
    this.view = this.buildView();
    for (const listener of this.listeners) listener();
  }

  /** For analysis helpers (pins, checkers) that read the live board. */
  raw() {
    return this.engine.raw();
  }
}
