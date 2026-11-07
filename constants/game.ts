import type { PieceSymbol } from "@/types";

export const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: "Pawn",
  n: "Knight",
  b: "Bishop",
  r: "Rook",
  q: "Queen",
  k: "King",
};

export const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

/** Descending value order, used to lay out captured pieces consistently. */
export const CAPTURE_ORDER: PieceSymbol[] = ["q", "r", "b", "n", "p"];

export const PROMOTION_CHOICES: PieceSymbol[] = ["q", "r", "b", "n"];

export const TIME_PRESETS: { label: string; minutes: number | null }[] = [
  { label: "No timer", minutes: null },
  { label: "1 min", minutes: 1 },
  { label: "3 min", minutes: 3 },
  { label: "5 min", minutes: 5 },
  { label: "10 min", minutes: 10 },
  { label: "15 min", minutes: 15 },
  { label: "30 min", minutes: 30 },
];

export const INCREMENT_PRESETS: { label: string; seconds: number }[] = [
  { label: "0s", seconds: 0 },
  { label: "1s", seconds: 1 },
  { label: "2s", seconds: 2 },
  { label: "3s", seconds: 3 },
  { label: "5s", seconds: 5 },
  { label: "10s", seconds: 10 },
];

export const CUSTOM_MINUTES_RANGE = { min: 1, max: 180 } as const;

export const DEFAULT_PLAYER_NAMES = { one: "Player 1", two: "Player 2" } as const;
