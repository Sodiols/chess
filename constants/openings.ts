import type { Square } from "@/types";

export interface Opening {
  name: string;
  /** Moves from the starting position, as from-to pairs. */
  line: [Square, Square][];
}

const line = (moves: string): [Square, Square][] =>
  moves.split(" ").map((move) => [move.slice(0, 2) as Square, move.slice(2, 4) as Square]);

/** Real openings played out on the showcase boards around the site. */
export const OPENINGS = {
  ruyLopez: { name: "The Ruy López", line: line("e2e4 e7e5 g1f3 b8c6 f1b5") },
  queensGambit: { name: "The Queen’s Gambit", line: line("d2d4 d7d5 c2c4 e7e6 b1c3 g8f6") },
  sicilian: { name: "The Sicilian Defence", line: line("e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6") },
  italian: { name: "The Italian Game", line: line("e2e4 e7e5 g1f3 b8c6 f1c4 f8c5") },
  caroKann: { name: "The Caro–Kann", line: line("e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4") },
  london: { name: "The London System", line: line("d2d4 d7d5 c1f4 g8f6 e2e3 c7c5") },
} satisfies Record<string, Opening>;

/** Famous short games that end in checkmate; the home page hero plays them at random. */
export const CHECKMATES: Opening[] = [
  { name: "Scholar’s Mate", line: line("e2e4 e7e5 f1c4 b8c6 d1h5 g8f6 h5f7") },
  { name: "Fool’s Mate", line: line("f2f3 e7e5 g2g4 d8h4") },
  { name: "Légal’s Mate", line: line("e2e4 e7e5 g1f3 d7d6 f1c4 c8g4 b1c3 g7g6 f3e5 g4d1 c4f7 e8e7 c3d5") },
  { name: "A Caro–Kann smothered mate", line: line("e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 b8d7 d1e2 g8f6 e4d6") },
  { name: "The Budapest Trap", line: line("d2d4 g8f6 c2c4 e7e5 d4e5 f6g4 c1f4 b8c6 g1f3 f8b4 b1d2 d8e7 a2a3 g4e5 a3b4 e5d3") },
];
