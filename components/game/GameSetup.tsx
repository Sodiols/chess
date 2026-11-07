"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import type {
  AssistanceMode,
  BoardThemeId,
  BotDifficulty,
  GameConfig,
  PieceStyleId,
} from "@/types";
import {
  BOT_DIFFICULTIES,
  BOT_DIFFICULTY_ORDER,
} from "@/lib/computer/difficulty";
import { ASSISTANCE } from "@/constants/assistance";
import {
  CUSTOM_MINUTES_RANGE,
  DEFAULT_PLAYER_NAMES,
  INCREMENT_PRESETS,
  TIME_PRESETS,
} from "@/constants/game";
import { STORAGE_KEYS } from "@/lib/storage";
import { createPersistentStore } from "@/lib/persistentStore";
import { useGameSettings } from "@/hooks/useGameSettings";
import { Button } from "@/components/ui/Button";
import { OptionGroup } from "@/components/ui/OptionGroup";
import { TextField } from "@/components/ui/TextField";
import { BOARD_THEMES, PIECE_STYLES } from "@/constants/board";
import { ModeSelector } from "@/components/ModeSelector";
import { ShowcaseBoard } from "@/components/chess/ShowcaseBoard";
import { MODE_DETAILS } from "@/constants/assistance";
import { OPENINGS } from "@/constants/openings";

type SideChoice = "one-white" | "one-black" | "random";

interface StoredSetup {
  mode: AssistanceMode;
  playerOne: string;
  playerTwo: string;
  side: SideChoice;
  /** Minutes per player; 0 means no timer. */
  minutes: number;
  incrementSeconds: number;
  /** Computer strength, used only by the computer setup. */
  difficulty: BotDifficulty;
}

const DEFAULT_SETUP: StoredSetup = {
  mode: "beginner",
  playerOne: "",
  playerTwo: "",
  side: "one-white",
  minutes: 10,
  incrementSeconds: 0,
  difficulty: "medium",
};

const PRESET_MINUTES = TIME_PRESETS.map((preset) => preset.minutes ?? 0);

const setupStore = createPersistentStore(
  STORAGE_KEYS.setup,
  DEFAULT_SETUP,
  (setup) =>
    BOT_DIFFICULTY_ORDER.includes(setup.difficulty)
      ? setup
      : { ...setup, difficulty: DEFAULT_SETUP.difficulty },
);

interface GameSetupProps {
  initialMode: AssistanceMode | null;
  onStart: (config: GameConfig) => void;
  /** `local` is two people on one device; `computer` is one person against the bot. */
  variant?: "local" | "computer";
}

export function GameSetup({
  initialMode,
  onStart,
  variant = "local",
}: GameSetupProps) {
  const vsComputer = variant === "computer";
  const { settings, updateSettings } = useGameSettings();

  // The stored setup is read through a store rather than an effect, so the
  // server-rendered form matches and edits simply layer on top of it.
  const stored = useSyncExternalStore(
    setupStore.subscribe,
    setupStore.getSnapshot,
    setupStore.getServerSnapshot,
  );
  const [edits, setEdits] = useState<Partial<StoredSetup>>({});
  const setup = useMemo<StoredSetup>(
    () => ({
      ...stored,
      ...(initialMode ? { mode: initialMode } : {}),
      ...edits,
    }),
    [stored, initialMode, edits],
  );

  const storedIsCustom =
    setup.minutes > 0 && !PRESET_MINUTES.includes(setup.minutes);
  const [customMinutes, setCustomMinutes] = useState<string | null>(null);
  const [customSelected, setCustomSelected] = useState<boolean | null>(null);

  const useCustom = customSelected ?? storedIsCustom;
  const customValue =
    customMinutes ?? (storedIsCustom ? String(setup.minutes) : "20");

  const patch = (next: Partial<StoredSetup>) =>
    setEdits((current) => ({ ...current, ...next }));

  const resolvedMinutes = useCustom ? clampMinutes(customValue) : setup.minutes;

  const handleStart = () => {
    const playerOne =
      setup.playerOne.trim() || (vsComputer ? "You" : DEFAULT_PLAYER_NAMES.one);
    const playerTwo = vsComputer
      ? `Computer (${BOT_DIFFICULTIES[setup.difficulty].name})`
      : setup.playerTwo.trim() || DEFAULT_PLAYER_NAMES.two;

    const oneIsWhite =
      setup.side === "random"
        ? Math.random() < 0.5
        : setup.side === "one-white";

    setupStore.update({ ...setup, minutes: resolvedMinutes });
    // Undo availability follows the mode's documented default at game start.
    updateSettings({ allowUndo: ASSISTANCE[setup.mode].defaultAllowUndo });

    onStart({
      mode: setup.mode,
      players: oneIsWhite
        ? { w: playerOne, b: playerTwo }
        : { w: playerTwo, b: playerOne },
      timeControl:
        resolvedMinutes > 0
          ? {
              initialMs: resolvedMinutes * 60_000,
              incrementMs: setup.incrementSeconds * 1000,
            }
          : null,
      ...(vsComputer
        ? {
            bot: {
              color: oneIsWhite ? ("b" as const) : ("w" as const),
              difficulty: setup.difficulty,
            },
          }
        : {}),
    });
  };

  const nameOne =
    setup.playerOne.trim() || (vsComputer ? "You" : DEFAULT_PLAYER_NAMES.one);
  const nameTwo = vsComputer
    ? `the computer (${BOT_DIFFICULTIES[setup.difficulty].name})`
    : setup.playerTwo.trim() || DEFAULT_PLAYER_NAMES.two;
  const sideWord =
    setup.side === "random"
      ? "a random colour"
      : setup.side === "one-white"
        ? "White"
        : "Black";
  const clockWord =
    resolvedMinutes > 0
      ? `${resolvedMinutes} min${setup.incrementSeconds ? ` + ${setup.incrementSeconds}s` : ""} each`
      : "no clock";

  return (
    <div className="mx-auto grid w-full max-w-[92rem] gap-12 px-4 pb-20 sm:px-6 lg:grid-cols-[minmax(0,40rem)_minmax(0,1fr)] lg:gap-16 lg:px-8">
      <div>
        <h1 className="animate-enter text-[2.25rem] leading-[1.02] font-extrabold sm:text-[2.75rem]">
          {vsComputer ? "Play the computer" : "Set up the game"}
        </h1>
        <p
          className="mt-4 animate-enter text-[1.0625rem] text-muted"
          style={{ animationDelay: "60ms" }}
        >
          {vsComputer
            ? "The engine runs on this device and works offline."
            : "Both players share this device. Nothing is sent anywhere."}
        </p>

        <div
          className="mt-10 animate-enter space-y-8"
          style={{ animationDelay: "120ms" }}
        >
          {vsComputer && (
            <OptionGroup<BotDifficulty>
              legend="Computer strength"
              columns={3}
              value={setup.difficulty}
              onChange={(difficulty) => patch({ difficulty })}
              options={BOT_DIFFICULTY_ORDER.map((difficulty) => ({
                value: difficulty,
                label: BOT_DIFFICULTIES[difficulty].name,
                visual: (
                  <StrengthBars
                    level={BOT_DIFFICULTY_ORDER.indexOf(difficulty) + 1}
                  />
                ),
              }))}
            />
          )}
          {vsComputer && (
            <p className="-mt-5 text-sm text-muted">
              {BOT_DIFFICULTIES[setup.difficulty].summary}.
            </p>
          )}

          <section>
            <h2 className="mb-2.5 text-sm font-semibold">
              {vsComputer ? "Board assistance" : "Assistance"}
            </h2>
            <ModeSelector
              layout="compact"
              value={setup.mode}
              onSelect={(mode) => patch({ mode })}
            />
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <TextField
              label={vsComputer ? "Your name" : "Player 1"}
              value={setup.playerOne}
              placeholder={vsComputer ? "You" : DEFAULT_PLAYER_NAMES.one}
              onChange={(playerOne) => patch({ playerOne })}
            />
            {!vsComputer && (
              <TextField
                label="Player 2"
                value={setup.playerTwo}
                placeholder={DEFAULT_PLAYER_NAMES.two}
                onChange={(playerTwo) => patch({ playerTwo })}
              />
            )}
          </section>

          <OptionGroup<SideChoice>
            legend={vsComputer ? "You play" : "Player 1 plays"}
            columns={3}
            value={setup.side}
            onChange={(side) => patch({ side })}
            options={[
              { value: "one-white", label: "White" },
              { value: "one-black", label: "Black" },
              { value: "random", label: "Random" },
            ]}
          />

          <section>
            <OptionGroup
              legend="Time per player"
              columns={4}
              value={useCustom ? "custom" : String(setup.minutes)}
              onChange={(value) => {
                if (value === "custom") {
                  setCustomSelected(true);
                  return;
                }
                setCustomSelected(false);
                patch({ minutes: Number(value) });
              }}
              options={[
                ...TIME_PRESETS.map((preset) => ({
                  value: String(preset.minutes ?? 0),
                  label: preset.label,
                })),
                { value: "custom", label: "Custom" },
              ]}
            />

            {useCustom && (
              <div className="mt-3 flex items-center gap-3">
                <label htmlFor="custom-minutes" className="text-sm text-muted">
                  Minutes
                </label>
                <input
                  id="custom-minutes"
                  type="number"
                  min={CUSTOM_MINUTES_RANGE.min}
                  max={CUSTOM_MINUTES_RANGE.max}
                  value={customValue}
                  onChange={(event) => setCustomMinutes(event.target.value)}
                  className="numeric h-10 w-24 rounded-lg border border-line bg-raised px-3 text-sm hover:border-line-strong focus:border-accent focus:outline-none"
                />
                <span className="text-xs text-faint">
                  {CUSTOM_MINUTES_RANGE.min}–{CUSTOM_MINUTES_RANGE.max}
                </span>
              </div>
            )}
          </section>

          {resolvedMinutes > 0 && (
            <OptionGroup
              legend="Increment per move"
              columns={3}
              value={String(setup.incrementSeconds)}
              onChange={(value) => patch({ incrementSeconds: Number(value) })}
              options={INCREMENT_PRESETS.map((preset) => ({
                value: String(preset.seconds),
                label: preset.label,
              }))}
            />
          )}

          <section className="grid gap-5 sm:grid-cols-2">
            <OptionGroup<BoardThemeId>
              legend="Board"
              columns={4}
              value={settings.boardTheme}
              onChange={(boardTheme) => updateSettings({ boardTheme })}
              options={BOARD_THEMES.map((theme) => ({
                value: theme.id,
                label: theme.name,
                visual: (
                  <span
                    aria-hidden
                    className="grid size-6 grid-cols-2 grid-rows-2 overflow-hidden rounded-sm"
                  >
                    <span style={{ background: theme.light }} />
                    <span style={{ background: theme.dark }} />
                    <span style={{ background: theme.dark }} />
                    <span style={{ background: theme.light }} />
                  </span>
                ),
              }))}
            />
            <OptionGroup<PieceStyleId>
              legend="Pieces"
              columns={2}
              value={settings.pieceStyle}
              onChange={(pieceStyle) => updateSettings({ pieceStyle })}
              options={PIECE_STYLES.map((style) => ({
                value: style.id,
                label: style.name,
              }))}
            />
          </section>

          <Button variant="primary" size="lg" block onClick={handleStart}>
            {vsComputer ? "Play computer" : "Start game"}
          </Button>
        </div>
      </div>

      {/* Live preview: the board, pieces and side chosen above, as they will look. */}
      <aside aria-label="Preview" className="hidden lg:block">
        <div
          className="sticky top-24 animate-enter"
          style={{ animationDelay: "160ms" }}
        >
          <ShowcaseBoard
            opening={vsComputer ? OPENINGS.ruyLopez : OPENINGS.italian}
            orientation={setup.side === "one-black" ? "b" : "w"}
            caption={false}
            className="mx-auto max-w-[40rem]"
          />
          <p
            className="mx-auto mt-10 max-w-[34rem] text-center text-lg leading-relaxed text-muted"
            aria-live="polite"
          >
            <span className="font-semibold text-ink">{nameOne}</span>{" "}
            {nameOne === "You" ? "play" : "plays"} {sideWord} against{" "}
            <span className="font-semibold text-ink">{nameTwo}</span>,{" "}
            {clockWord}, with{" "}
            <span className="text-accent">
              {MODE_DETAILS[setup.mode].name.toLowerCase()}
            </span>{" "}
            help.
          </p>
        </div>
      </aside>
    </div>
  );
}

function StrengthBars({ level }: { level: number }) {
  return (
    <span aria-hidden className="flex h-4 items-end gap-[3px]">
      {[1, 2, 3].map((step) => (
        <span
          key={step}
          className={`w-[3px] rounded-full ${step <= level ? "bg-accent" : "bg-line-strong"}`}
          style={{ height: `${step * 4 + 4}px` }}
        />
      ))}
    </span>
  );
}

function clampMinutes(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return CUSTOM_MINUTES_RANGE.min;
  return Math.min(
    CUSTOM_MINUTES_RANGE.max,
    Math.max(CUSTOM_MINUTES_RANGE.min, parsed),
  );
}
