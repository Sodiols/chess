import type { BoardThemeId, PieceStyleId, Square } from "@/types";

export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"] as const;

/** All 64 squares in white-perspective reading order: a8 … h1. */
export const SQUARES: Square[] = RANKS.flatMap((rank) =>
  FILES.map((file) => `${file}${rank}` as Square),
);

interface BoardTheme {
  id: BoardThemeId;
  name: string;
  light: string;
  dark: string;
  /** The frame around the squares, and the slab's front edge in 3D. */
  rim: string;
  edge: string;
}

export const BOARD_THEMES: BoardTheme[] = [
  { id: "walnut", name: "Walnut", light: "#eadbc0", dark: "#a5764e", rim: "#3d2818", edge: "#21150c" },
  { id: "slate", name: "Slate", light: "#d3d9e0", dark: "#6c7f92", rim: "#2a3139", edge: "#171b20" },
  { id: "sage", name: "Sage", light: "#e9eccd", dark: "#779556", rim: "#2f3a26", edge: "#1a2115" },
  { id: "ivory", name: "Ivory", light: "#f2e8dc", dark: "#b28a63", rim: "#4a3524", edge: "#2b1e14" },
];

export const PIECE_STYLES: { id: PieceStyleId; name: string }[] = [
  { id: "classic", name: "Classic" },
  { id: "minimal", name: "Minimal" },
];

export function getBoardTheme(id: BoardThemeId): BoardTheme {
  return BOARD_THEMES.find((theme) => theme.id === id) ?? BOARD_THEMES[0]!;
}

/** Column index of a square in white perspective (a = 0). */
export function fileIndex(square: Square): number {
  return square.charCodeAt(0) - 97;
}

/** Row index of a square in white perspective (rank 8 = 0). */
export function rankIndex(square: Square): number {
  return 8 - Number(square[1]);
}

export function isLightSquare(square: Square): boolean {
  return (fileIndex(square) + rankIndex(square)) % 2 === 0;
}
