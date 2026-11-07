import type { BotDifficulty } from "@/types";
import type { BotMove } from "./search";

interface BotResponse {
  id: number;
  move: BotMove | null;
}

/** The worker is created on first use, so the engine never loads until a bot game starts. */
export function createBotWorker(): Worker {
  return new Worker(new URL("./bot.worker.ts", import.meta.url), { type: "module" });
}

/**
 * Talks to the engine worker. A search cannot be interrupted from outside, so
 * cancelling an in-flight request terminates the worker outright; the next
 * request starts a fresh one. Responses for anything but the current request
 * are dropped, so a stale move can never reach a new position.
 */
export class BotClient {
  private worker: Worker | null = null;
  private current: { id: number; resolve: (move: BotMove | null) => void } | null = null;
  private nextId = 1;

  constructor(private readonly createWorker: () => Worker = createBotWorker) {}

  request(fen: string, difficulty: BotDifficulty): { promise: Promise<BotMove | null>; cancel: () => void } {
    this.cancel();
    const id = this.nextId++;
    const promise = new Promise<BotMove | null>((resolve) => {
      this.current = { id, resolve };
    });
    this.ensureWorker().postMessage({ id, fen, difficulty });
    return {
      promise,
      cancel: () => {
        if (this.current?.id === id) this.cancel();
      },
    };
  }

  /** Abandons the current request, if any. */
  cancel(): void {
    if (!this.current) return;
    this.current.resolve(null);
    this.current = null;
    this.worker?.terminate();
    this.worker = null;
  }

  dispose(): void {
    this.cancel();
    this.worker?.terminate();
    this.worker = null;
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = this.createWorker();
    worker.onmessage = (event: MessageEvent<BotResponse>) => {
      const pending = this.current;
      if (!pending || event.data.id !== pending.id) return;
      this.current = null;
      pending.resolve(event.data.move);
    };
    worker.onerror = () => {
      this.cancel();
    };
    this.worker = worker;
    return worker;
  }
}
