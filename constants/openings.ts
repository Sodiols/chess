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
  // Ends in checkmate: the home page hero plays it to show a game being won.
  scholarsMate: { name: "Scholar’s Mate", line: line("e2e4 e7e5 f1c4 b8c6 d1h5 g8f6 h5f7") },
} satisfies Record<string, Opening>;
