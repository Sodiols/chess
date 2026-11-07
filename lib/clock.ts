import type { Color } from "@/types";

export interface ClockSnapshot {
  remaining: Record<Color, number>;
  running: Color | null;
  paused: boolean;
}

/** Fine enough to render tenths under ten seconds without busy-looping. */
const TICK_MS = 100;

/**
 * The clock lives outside React and publishes immutable snapshots. Only the two
 * clock readouts subscribe, so a ticking game never re-renders the board.
 */
export class ChessClock {
  private remaining: Record<Color, number>;
  private running: Color | null = null;
  private paused = false;
  private lastTick = 0;
  private handle: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<() => void>();
  private snapshot: ClockSnapshot;
  private stopped = false;

  /** Called once when a player's time reaches zero. */
  onFlag: ((color: Color) => void) | null = null;

  constructor(
    private readonly initialMs: number,
    private readonly incrementMs: number,
  ) {
    this.remaining = { w: initialMs, b: initialMs };
    this.snapshot = this.buildSnapshot();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ClockSnapshot => this.snapshot;

  getRemaining(): Record<Color, number> {
    this.drain();
    return { ...this.remaining };
  }

  /** Begins (or resumes on) a colour's clock. */
  start(color: Color): void {
    if (this.stopped) return;
    this.drain();
    this.running = color;
    this.paused = false;
    this.lastTick = Date.now();
    this.ensureTimer();
    this.emit();
  }

  /** Adds the increment to the mover and hands the clock to the opponent. */
  moveCompleted(mover: Color): void {
    if (this.stopped) return;
    this.drain();
    if (this.stopped) return;
    this.remaining[mover] += this.incrementMs;
    this.running = mover === "w" ? "b" : "w";
    this.lastTick = Date.now();
    this.ensureTimer();
    this.emit();
  }

  pause(): void {
    if (this.paused || this.stopped) return;
    this.drain();
    this.paused = true;
    this.clearTimer();
    this.emit();
  }

  resume(): void {
    if (!this.paused || this.stopped) return;
    this.paused = false;
    this.lastTick = Date.now();
    this.ensureTimer();
    this.emit();
  }

  /** Permanently halts the clock; used when the game ends. */
  stop(): void {
    if (this.stopped) return;
    this.drain();
    this.stopped = true;
    this.running = null;
    this.clearTimer();
    this.emit();
  }

  /** Restores exact times, used when a move is taken back. */
  restore(remaining: Record<Color, number>, running: Color): void {
    this.remaining = { ...remaining };
    this.stopped = false;
    this.running = running;
    this.lastTick = Date.now();
    if (!this.paused) this.ensureTimer();
    this.emit();
  }

  reset(): void {
    this.clearTimer();
    this.remaining = { w: this.initialMs, b: this.initialMs };
    this.running = null;
    this.paused = false;
    this.stopped = false;
    this.emit();
  }

  /**
   * Stops the interval without dropping subscribers, so React's development
   * remount cycle cannot leave a live clock without listeners.
   */
  dispose(): void {
    this.clearTimer();
  }

  private drain(): void {
    if (this.running === null || this.paused || this.stopped) return;

    const now = Date.now();
    const active = this.running;
    this.remaining[active] -= now - this.lastTick;
    this.lastTick = now;

    if (this.remaining[active] <= 0) {
      this.remaining[active] = 0;
      this.stopped = true;
      this.running = null;
      this.clearTimer();
      this.onFlag?.(active);
    }
  }

  private ensureTimer(): void {
    if (this.handle !== null || this.running === null || this.paused || this.stopped) return;
    this.handle = setInterval(() => {
      this.drain();
      this.emit();
    }, TICK_MS);
  }

  private clearTimer(): void {
    if (this.handle === null) return;
    clearInterval(this.handle);
    this.handle = null;
  }

  private buildSnapshot(): ClockSnapshot {
    return { remaining: { ...this.remaining }, running: this.running, paused: this.paused };
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }
}
