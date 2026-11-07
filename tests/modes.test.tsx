// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { useChessGame } from "@/hooks/useChessGame";
import { useComputerOpponent } from "@/hooks/useComputerOpponent";
import { DEFAULT_SETTINGS } from "@/hooks/useGameSettings";
import { GameSetup } from "@/components/game/GameSetup";
import { ModeCards } from "@/components/play/ModeCards";
import { mergeRoom } from "@/hooks/useRoomBrowser";
import type { RoomSummary } from "@/lib/multiplayer/types";
import type { GameConfig } from "@/types";

const request = vi.fn();
vi.mock("@/lib/computer/botClient", () => ({
  BotClient: class {
    request = request;
    dispose() {}
  },
}));

beforeEach(() => {
  window.localStorage.clear();
  request.mockReset();
});

const SETTINGS = { ...DEFAULT_SETTINGS, sound: false, allowUndo: true };
const BOT_GAME: GameConfig = {
  mode: "beginner",
  players: { w: "You", b: "Computer (Pro)" },
  timeControl: null,
  bot: { color: "b", difficulty: "pro" },
};

describe("computer setup", () => {
  it("builds a bot config with the chosen strength and side", () => {
    const onStart = vi.fn();
    render(<GameSetup initialMode={null} onStart={onStart} variant="computer" />);

    fireEvent.click(screen.getByRole("radio", { name: "Pro" }));
    fireEvent.click(screen.getByRole("radio", { name: "Black" }));
    fireEvent.click(screen.getByRole("button", { name: "Play computer" }));

    expect(onStart.mock.calls[0]![0]).toMatchObject({
      players: { w: "Computer (Pro)", b: "You" },
      bot: { color: "w", difficulty: "pro" },
    });
  });

  it("keeps the local setup free of any bot", () => {
    const onStart = vi.fn();
    render(<GameSetup initialMode={null} onStart={onStart} />);
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));
    expect(onStart.mock.calls[0]![0].bot).toBeUndefined();
  });
});

describe("playing the computer", () => {
  it("locks the board on the computer's turn and undoes its reply with yours", () => {
    const hook = renderHook(() => useChessGame(BOT_GAME, SETTINGS));
    act(() => hook.result.current.attemptMove("e2", "e4"));
    expect(hook.result.current.isInteractive).toBe(false);

    // The human can't move Black's pieces for the computer.
    act(() => hook.result.current.selectSquare("e7"));
    expect(hook.result.current.selected).toBeNull();

    act(() => hook.result.current.playMove("e7", "e5"));
    expect(hook.result.current.isInteractive).toBe(true);
    expect(hook.result.current.canUndo).toBe(true);

    act(() => hook.result.current.undo());
    expect(hook.result.current.position.history).toHaveLength(0);
    expect(hook.result.current.position.turn).toBe("w");
  });

  it("starts with the human's colour at the bottom", () => {
    const hook = renderHook(() =>
      useChessGame({ ...BOT_GAME, bot: { color: "w", difficulty: "medium" } }, SETTINGS),
    );
    expect(hook.result.current.orientation).toBe("b");
  });

  it("asks the engine only on its turn and drops a stale answer", async () => {
    let resolve: (move: unknown) => void = () => {};
    const cancel = vi.fn();
    request.mockImplementation(() => ({ promise: new Promise((done) => (resolve = done)), cancel }));
    const playMove = vi.fn();

    const { rerender } = renderHook((props: { fen: string; turn: "w" | "b"; finished: boolean }) =>
      useComputerOpponent(BOT_GAME.bot, { ...props, paused: false, playMove }),
      { initialProps: { fen: "start", turn: "w", finished: false } },
    );
    expect(request).not.toHaveBeenCalled();

    rerender({ fen: "after-e4", turn: "b", finished: false });
    expect(request).toHaveBeenCalledWith("after-e4", "pro");

    // The game ends before the engine answers: the request is cancelled and
    // its late answer is ignored.
    rerender({ fen: "after-e4", turn: "b", finished: true });
    expect(cancel).toHaveBeenCalled();
    await act(async () => {
      resolve({ from: "e7", to: "e5" });
      await new Promise((done) => setTimeout(done, 600));
    });
    expect(playMove).not.toHaveBeenCalled();
  });
});

describe("room browser", () => {
  const room = (code: string, patch: Partial<RoomSummary> = {}): RoomSummary => ({
    code,
    name: code,
    hostName: "Host",
    initialMs: 300_000,
    incrementMs: 0,
    hostColor: "random",
    status: "waiting",
    discoverable: true,
    players: 1,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    gameId: null,
    ...patch,
  });

  it("adds new rooms, updates in place, and removes full or closed rooms", () => {
    let rooms = [room("AAAAAA"), room("BBBBBB")];
    rooms = mergeRoom(rooms, room("CCCCCC"), () => 0.99);
    expect(rooms.map((r) => r.code)).toEqual(["AAAAAA", "BBBBBB", "CCCCCC"]);

    rooms = mergeRoom(rooms, room("AAAAAA", { name: "Renamed" }));
    expect(rooms[0]!.name).toBe("Renamed");

    rooms = mergeRoom(rooms, room("BBBBBB", { status: "started", players: 2 }));
    rooms = mergeRoom(rooms, room("CCCCCC", { status: "cancelled" }));
    expect(rooms.map((r) => r.code)).toEqual(["AAAAAA"]);
  });

  it("never lists an expired room", () => {
    const expired = room("DDDDDD", { expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(mergeRoom([], expired)).toEqual([]);
  });
});

describe("mode selection", () => {
  it("offers all four modes with their actions", () => {
    render(<ModeCards />);
    for (const title of ["Play Online", "Private Match", "Play Computer", "Local 1v1"]) {
      expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    }
    expect(screen.getByRole("link", { name: "Find Opponent" }).getAttribute("href")).toBe("/play/online");
    expect(screen.getByRole("link", { name: "Join Room" }).getAttribute("href")).toContain("/play/rooms");
    expect(screen.getByRole("link", { name: "Start Local Game" }).getAttribute("href")).toBe("/play/local");
  });
});
