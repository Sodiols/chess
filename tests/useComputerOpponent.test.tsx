// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useComputerOpponent } from "@/hooks/useComputerOpponent";
import { BOT_DIFFICULTIES, BOT_DIFFICULTY_ORDER } from "@/lib/computer/difficulty";

vi.mock("@/lib/computer/botClient", () => ({
  BotClient: class {
    request() {
      return { promise: Promise.resolve({ from: "e7", to: "e5" }), cancel: vi.fn() };
    }
    dispose() {}
  },
}));

afterEach(() => vi.useRealTimers());

it.each(BOT_DIFFICULTY_ORDER)("paces an immediate engine reply at %s", async (difficulty) => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  const playMove = vi.fn();
  renderHook(() => useComputerOpponent({ color: "b", difficulty }, {
    fen: "position", turn: "b", finished: false, paused: false, playMove,
  }));
  await act(async () => {});
  const { replyDelayMs } = BOT_DIFFICULTIES[difficulty];
  act(() => vi.advanceTimersByTime(replyDelayMs - 1));
  expect(playMove).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(playMove).toHaveBeenCalledExactlyOnceWith("e7", "e5", undefined);
});

it("cancels a queued reply when the game pauses", async () => {
  vi.useFakeTimers();
  const playMove = vi.fn();
  const { rerender } = renderHook(({ paused }) => useComputerOpponent({ color: "b", difficulty: "beginner" }, {
    fen: "position", turn: "b", finished: false, paused, playMove,
  }), { initialProps: { paused: false } });
  await act(async () => {});
  rerender({ paused: true });
  act(() => vi.runAllTimers());
  expect(playMove).not.toHaveBeenCalled();
});
