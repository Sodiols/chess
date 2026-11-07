"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { GameSettings } from "@/types";
import { BOARD_THEMES, PIECE_STYLES } from "@/constants/board";
import { createPersistentStore } from "@/lib/persistentStore";
import { STORAGE_KEYS } from "@/lib/storage";

export const DEFAULT_SETTINGS: GameSettings = {
  sound: true,
  coordinates: true,
  animations: true,
  board3d: true,
  boardTheme: "walnut",
  pieceStyle: "classic",
  showCaptured: true,
  showMoveHistory: true,
  showMaterial: true,
  allowUndo: true,
};

/** Drops values left behind by an older build that no longer exist. */
function sanitize(settings: GameSettings): GameSettings {
  return {
    ...settings,
    boardTheme: BOARD_THEMES.some((theme) => theme.id === settings.boardTheme)
      ? settings.boardTheme
      : DEFAULT_SETTINGS.boardTheme,
    pieceStyle: PIECE_STYLES.some((style) => style.id === settings.pieceStyle)
      ? settings.pieceStyle
      : DEFAULT_SETTINGS.pieceStyle,
  };
}

const store = createPersistentStore(STORAGE_KEYS.settings, DEFAULT_SETTINGS, sanitize);

export function useGameSettings(): {
  settings: GameSettings;
  updateSettings: (patch: Partial<GameSettings>) => void;
} {
  const settings = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const updateSettings = useCallback((patch: Partial<GameSettings>) => store.update(patch), []);

  return { settings, updateSettings };
}
