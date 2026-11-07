import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChessClock } from "@/lib/clock";

const MINUTE = 60_000;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("ChessClock", () => {
  it("starts both players on the full time", () => {
    const clock = new ChessClock(5 * MINUTE, 0);
    expect(clock.getSnapshot().remaining).toEqual({ w: 5 * MINUTE, b: 5 * MINUTE });
    expect(clock.getSnapshot().running).toBeNull();
  });

  it("only drains the running player's time", () => {
    const clock = new ChessClock(MINUTE, 0);
    clock.start("w");
    vi.advanceTimersByTime(10_000);

    const { remaining, running } = clock.getSnapshot();
    expect(running).toBe("w");
    expect(remaining.w).toBeCloseTo(50_000, -2);
    expect(remaining.b).toBe(MINUTE);
  });

  it("hands the clock over and applies the increment to the mover", () => {
    const clock = new ChessClock(MINUTE, 3_000);
    clock.start("w");
    vi.advanceTimersByTime(10_000);
    clock.moveCompleted("w");

    const { remaining, running } = clock.getSnapshot();
    expect(running).toBe("b");
    // 60s − 10s spent + 3s increment.
    expect(remaining.w).toBeCloseTo(53_000, -2);

    vi.advanceTimersByTime(5_000);
    expect(clock.getSnapshot().remaining.b).toBeCloseTo(55_000, -2);
    // White's time is frozen while Black thinks.
    expect(clock.getSnapshot().remaining.w).toBeCloseTo(53_000, -2);
  });

  it("stops draining while paused and resumes from the same reading", () => {
    const clock = new ChessClock(MINUTE, 0);
    clock.start("w");
    vi.advanceTimersByTime(5_000);
    clock.pause();

    expect(clock.getSnapshot().paused).toBe(true);
    vi.advanceTimersByTime(30_000);
    expect(clock.getSnapshot().remaining.w).toBeCloseTo(55_000, -2);

    clock.resume();
    vi.advanceTimersByTime(5_000);
    expect(clock.getSnapshot().remaining.w).toBeCloseTo(50_000, -2);
  });

  it("flags exactly once and never reports negative time", () => {
    const clock = new ChessClock(2_000, 0);
    const flagged: string[] = [];
    clock.onFlag = (color) => flagged.push(color);

    clock.start("w");
    vi.advanceTimersByTime(5_000);

    expect(flagged).toEqual(["w"]);
    expect(clock.getSnapshot().remaining.w).toBe(0);
    expect(clock.getSnapshot().running).toBeNull();

    vi.advanceTimersByTime(5_000);
    expect(flagged).toEqual(["w"]);
  });

  it("ignores further moves once the game has been stopped", () => {
    const clock = new ChessClock(MINUTE, 5_000);
    clock.start("w");
    vi.advanceTimersByTime(4_000);
    clock.stop();

    const frozen = clock.getSnapshot().remaining.w;
    clock.moveCompleted("w");
    vi.advanceTimersByTime(10_000);

    expect(clock.getSnapshot().remaining.w).toBe(frozen);
    expect(clock.getSnapshot().running).toBeNull();
  });

  it("restores exact readings when a move is taken back", () => {
    const clock = new ChessClock(MINUTE, 2_000);
    clock.start("w");
    vi.advanceTimersByTime(8_000);

    const before = clock.getRemaining();
    clock.moveCompleted("w");
    vi.advanceTimersByTime(6_000);

    clock.restore(before, "w");
    expect(clock.getSnapshot().remaining).toEqual(before);
    expect(clock.getSnapshot().running).toBe("w");
  });

  it("un-flags on restore so an undone timeout can be played on", () => {
    const clock = new ChessClock(3_000, 0);
    clock.start("w");
    vi.advanceTimersByTime(5_000);
    expect(clock.getSnapshot().remaining.w).toBe(0);

    clock.restore({ w: 3_000, b: 3_000 }, "w");
    vi.advanceTimersByTime(1_000);
    expect(clock.getSnapshot().remaining.w).toBeCloseTo(2_000, -2);
  });

  it("notifies subscribers on each tick and stops after unsubscribing", () => {
    const clock = new ChessClock(MINUTE, 0);
    let notifications = 0;
    const unsubscribe = clock.subscribe(() => notifications++);

    clock.start("w");
    vi.advanceTimersByTime(500);
    expect(notifications).toBeGreaterThan(1);

    unsubscribe();
    const seen = notifications;
    vi.advanceTimersByTime(500);
    expect(notifications).toBe(seen);
  });

  it("returns a fresh snapshot object only when something changed", () => {
    const clock = new ChessClock(MINUTE, 0);
    const first = clock.getSnapshot();
    expect(clock.getSnapshot()).toBe(first);

    clock.start("w");
    expect(clock.getSnapshot()).not.toBe(first);
  });

  it("returns to the starting time on reset", () => {
    const clock = new ChessClock(MINUTE, 0);
    clock.start("w");
    vi.advanceTimersByTime(20_000);
    clock.reset();

    expect(clock.getSnapshot()).toMatchObject({
      remaining: { w: MINUTE, b: MINUTE },
      running: null,
      paused: false,
    });
  });
});
