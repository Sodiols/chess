// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { GameConfig } from "@/types";
import { GameSetup } from "@/components/game/GameSetup";
import { ChessGame } from "@/components/game/ChessGame";
import { SettingsPanel } from "@/components/game/SettingsPanel";
import { useGameSettings } from "@/hooks/useGameSettings";

const PLAYERS = { w: "Ada", b: "Daniel" };

function config(overrides: Partial<GameConfig> = {}): GameConfig {
  return { mode: "beginner", players: PLAYERS, timeControl: null, ...overrides };
}

function renderGame(overrides: Partial<GameConfig> = {}) {
  return render(
    <ChessGame
      config={config(overrides)}
      onRematch={vi.fn()}
      onRestart={vi.fn()}
      onNewGame={vi.fn()}
      onHome={vi.fn()}
    />,
  );
}

/** Squares live in a single board; the mobile and desktop panels are duplicated. */
function square(name: RegExp | string) {
  return screen.getByRole("button", { name });
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("GameSetup", () => {
  it("falls back to the default names when both fields are blank", () => {
    const onStart = vi.fn();
    render(<GameSetup initialMode="medium" onStart={onStart} />);

    fireEvent.click(screen.getByRole("button", { name: "Start game" }));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart.mock.calls[0]![0]).toMatchObject({
      mode: "medium",
      players: { w: "Player 1", b: "Player 2" },
    });
  });

  it("assigns the chosen side and trims names", () => {
    const onStart = vi.fn();
    render(<GameSetup initialMode="pro" onStart={onStart} />);

    fireEvent.change(screen.getByLabelText("Player 1"), { target: { value: "  Ada  " } });
    fireEvent.change(screen.getByLabelText("Player 2"), { target: { value: "Daniel" } });
    fireEvent.click(screen.getByRole("radio", { name: "Black" }));
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));

    expect(onStart.mock.calls[0]![0]).toMatchObject({
      players: { w: "Daniel", b: "Ada" },
    });
  });

  it("builds a time control from the selected preset and increment", () => {
    const onStart = vi.fn();
    render(<GameSetup initialMode="medium" onStart={onStart} />);

    fireEvent.click(screen.getByRole("radio", { name: "5 min" }));
    fireEvent.click(screen.getByRole("radio", { name: "3s" }));
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));

    expect(onStart.mock.calls[0]![0].timeControl).toEqual({
      initialMs: 300_000,
      incrementMs: 3_000,
    });
  });

  it("produces no time control when the timer is off, and hides increment", () => {
    const onStart = vi.fn();
    render(<GameSetup initialMode="medium" onStart={onStart} />);

    fireEvent.click(screen.getByRole("radio", { name: "No timer" }));
    expect(screen.queryByText("Increment per move")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Start game" }));
    expect(onStart.mock.calls[0]![0].timeControl).toBeNull();
  });

  it("remembers names and time control for the next game", () => {
    const onStart = vi.fn();
    const first = render(<GameSetup initialMode="medium" onStart={onStart} />);

    fireEvent.change(screen.getByLabelText("Player 1"), { target: { value: "Ada" } });
    fireEvent.click(screen.getByRole("radio", { name: "3 min" }));
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));
    first.unmount();

    render(<GameSetup initialMode={null} onStart={onStart} />);
    expect((screen.getByLabelText("Player 1") as HTMLInputElement).value).toBe("Ada");
    expect((screen.getByRole("radio", { name: "3 min" }) as HTMLInputElement).checked).toBe(true);
  });

  it("turns undo on for Beginner and off for Pro", () => {
    const onStart = vi.fn();
    const beginner = render(<GameSetup initialMode="beginner" onStart={onStart} />);
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));
    expect(JSON.parse(window.localStorage.getItem("gambit:settings")!).allowUndo).toBe(true);
    beginner.unmount();

    render(<GameSetup initialMode="pro" onStart={onStart} />);
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));
    expect(JSON.parse(window.localStorage.getItem("gambit:settings")!).allowUndo).toBe(false);
  });
});

describe("Settings persistence", () => {
  function Harness() {
    const { settings, updateSettings } = useGameSettings();
    return (
      <>
        <span data-testid="theme">{settings.boardTheme}</span>
        <SettingsPanel settings={settings} onChange={updateSettings} />
      </>
    );
  }

  it("writes a changed preference to local storage and reloads it", () => {
    const first = render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: "Sage" }));
    expect(screen.getByTestId("theme").textContent).toBe("sage");

    const stored = JSON.parse(window.localStorage.getItem("gambit:settings")!);
    expect(stored.boardTheme).toBe("sage");
    first.unmount();

    render(<Harness />);
    expect(screen.getByTestId("theme").textContent).toBe("sage");
  });

  it("ignores a stored theme that no longer exists", () => {
    window.localStorage.setItem("gambit:settings", JSON.stringify({ boardTheme: "neon" }));
    render(<Harness />);
    expect(screen.getByTestId("theme").textContent).toBe("walnut");
  });

  it("toggles a switch and keeps the rest of the settings intact", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("switch", { name: /Board coordinates/ }));

    const stored = JSON.parse(window.localStorage.getItem("gambit:settings")!);
    expect(stored.coordinates).toBe(false);
    expect(stored.sound).toBe(true);
  });
});

describe("ChessGame — board and assistance", () => {
  it("renders a full board with descriptive square labels", () => {
    renderGame();
    expect(screen.getAllByRole("button", { name: /on [a-h][1-8]|, empty/ }).length).toBe(64);
    expect(square(/White knight on g1/)).toBeTruthy();
    expect(square(/Black queen on d8/)).toBeTruthy();
  });

  it("marks legal destinations in Beginner mode", () => {
    renderGame({ mode: "beginner" });
    fireEvent.click(square(/White pawn on e2/));

    expect(square(/e4.*legal move/)).toBeTruthy();
    expect(screen.getByText(/Pawn on e2: 2 legal moves/)).toBeTruthy();
  });

  it("marks legal destinations in Medium mode but gives no coaching", () => {
    renderGame({ mode: "medium" });
    fireEvent.click(square(/White pawn on e2/));

    expect(square(/e4.*legal move/)).toBeTruthy();
    expect(screen.queryByText(/legal moves\./)).toBeNull();
  });

  it("marks nothing in Pro mode", () => {
    renderGame({ mode: "pro" });
    fireEvent.click(square(/White pawn on e2/));

    expect(screen.queryByRole("button", { name: /e4.*legal move/ })).toBeNull();
    expect(square(/White pawn on e2.*selected/)).toBeTruthy();
  });

  it("shows the undo control only while the undo setting is on", () => {
    // GameSetup seeds this per mode; the game screen simply follows the setting.
    const on = renderGame({ mode: "beginner" });
    expect(screen.getAllByRole("button", { name: "Undo last move" }).length).toBeGreaterThan(0);
    on.unmount();

    window.localStorage.setItem("gambit:settings", JSON.stringify({ allowUndo: false }));
    renderGame({ mode: "pro" });
    expect(screen.queryAllByRole("button", { name: "Undo last move" })).toHaveLength(0);
  });

  it("plays a move by clicking origin then destination", () => {
    renderGame();
    fireEvent.click(square(/White pawn on e2/));
    fireEvent.click(square(/e4/));

    expect(square(/White pawn on e4/)).toBeTruthy();
    expect(screen.getAllByText("e4").length).toBeGreaterThan(0);
  });
});

describe("ChessGame — destructive actions are confirmed", () => {
  function openMenu() {
    fireEvent.click(screen.getAllByRole("button", { name: /Menu/ })[0]!);
  }

  it("asks before resigning and only ends the game on confirmation", () => {
    renderGame();
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: /Resign as Ada/ }));

    const prompt = screen.getByText("Are you sure you want to resign?");
    expect(prompt).toBeTruthy();

    // Cancelling returns to the menu without a result.
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(/wins/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Resign as Ada/ }));
    fireEvent.click(screen.getByRole("button", { name: "Resign" }));
    expect(screen.getByText("Resignation — Daniel wins")).toBeTruthy();
  });

  it("asks before restarting", () => {
    const onRestart = vi.fn();
    render(
      <ChessGame
        config={config()}
        onRematch={vi.fn()}
        onRestart={onRestart}
        onNewGame={vi.fn()}
        onHome={vi.fn()}
      />,
    );

    openMenu();
    fireEvent.click(screen.getByRole("button", { name: /Restart/ }));
    expect(screen.getByText("Restart this game?")).toBeTruthy();
    expect(onRestart).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });
});

describe("ChessGame — result dialog", () => {
  it("announces checkmate and offers a rematch", () => {
    const onRematch = vi.fn();
    render(
      <ChessGame
        config={config()}
        onRematch={onRematch}
        onRestart={vi.fn()}
        onNewGame={vi.fn()}
        onHome={vi.fn()}
      />,
    );

    const moves: [RegExp, RegExp][] = [
      [/White pawn on e2/, /^e4/],
      [/Black pawn on e7/, /^e5/],
      [/White bishop on f1/, /^c4/],
      [/Black knight on b8/, /^c6/],
      [/White queen on d1/, /^h5/],
      [/Black knight on g8/, /^f6/],
      [/White queen on h5/, /Black pawn on f7/],
    ];

    for (const [from, to] of moves) {
      fireEvent.click(square(from));
      fireEvent.click(square(to));
    }

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Checkmate — Ada wins")).toBeTruthy();
    expect(within(dialog).getByText("1–0")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Rematch" }));
    expect(onRematch).toHaveBeenCalledTimes(1);
  });
});
