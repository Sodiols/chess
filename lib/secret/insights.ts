import { Chess, type Move, type Square as ChessSquare } from "chess.js";
import type { Color, PieceSymbol, Square } from "@/types";
import { PIECE_NAMES } from "@/constants/game";
import { findPins } from "@/lib/chess/analysis";
import type { EngineLine, EngineScore } from "./stockfish";

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const name = (type: PieceSymbol) => PIECE_NAMES[type].toLowerCase();

/** Plays UCI moves from `fen` with chess.js; stops at the first one that is not legal there. */
export function playUci(fen: string, pv: string[]): Move[] {
  const chess = new Chess(fen);
  const moves: Move[] = [];
  for (const uci of pv) {
    try {
      moves.push(
        chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] as PieceSymbol | undefined }),
      );
    } catch {
      break;
    }
  }
  return moves;
}

/** Score from white's point of view, in pawns, with mates mapped far beyond any material score. */
export function whitePawns(score: EngineScore, turn: Color): number {
  const sign = turn === "w" ? 1 : -1;
  if ("mate" in score) return sign * (score.mate > 0 ? 100 : -100);
  return (sign * score.cp) / 100;
}

/** "+0.85", "−1.20", "#3", "#−2", always from white's point of view. */
export function formatScore(score: EngineScore, turn: Color): string {
  const sign = turn === "w" ? 1 : -1;
  if ("mate" in score) {
    const mate = sign * score.mate;
    return mate === 0 ? "#0" : mate > 0 ? `#${mate}` : `#−${-mate}`;
  }
  const pawns = (sign * score.cp) / 100;
  return `${pawns > 0 ? "+" : pawns < 0 ? "−" : ""}${Math.abs(pawns).toFixed(2)}`;
}

/** Who stands better, in words, for a white-POV pawn score. */
export function describeEval(score: EngineScore, turn: Color): string {
  if ("mate" in score) {
    const winner = (score.mate > 0) === (turn === "w") ? "White" : "Black";
    return score.mate === 0 ? "Checkmate on the board" : `${winner} has a forced mate in ${Math.abs(score.mate)}`;
  }
  const pawns = whitePawns(score, turn);
  const side = pawns > 0 ? "White" : "Black";
  const size = Math.abs(pawns);
  if (size < 0.3) return "Roughly equal";
  if (size < 1) return `${side} is slightly better`;
  if (size < 2.5) return `${side} is clearly better`;
  return `${side} is winning`;
}

/**
 * Plain-language facts about an engine line: only what the move itself and the
 * engine's own numbers show. Nothing here guesses at intent beyond that.
 */
export function explainLine(fen: string, line: EngineLine, runnerUp?: EngineLine): string {
  const moves = playUci(fen, line.pv);
  const move = moves[0];
  if (!move) return "";
  const parts: string[] = [];

  if (move.isKingsideCastle() || move.isQueensideCastle()) parts.push("Castles, getting the king to safety and connecting the rooks.");
  else if (move.promotion) parts.push(`Promotes the pawn to a ${name(move.promotion)}.`);
  else if (move.captured) parts.push(`Takes the ${name(move.captured)} on ${move.to}.`);
  else if ((move.piece === "n" || move.piece === "b") && (move.from[1] === "1" || move.from[1] === "8"))
    parts.push(`Develops the ${name(move.piece)} toward the centre.`);
  else if (move.piece === "p" && ["d4", "e4", "d5", "e5", "c4", "c5"].includes(move.to))
    parts.push("Claims space in the centre with a pawn.");
  else parts.push(`Moves the ${name(move.piece)} to ${move.to}.`);

  if (move.san.endsWith("#")) parts.push("It is checkmate.");
  else if (move.san.includes("+")) parts.push("It gives check.");

  // Material at the end of the line versus now, as calculated by the engine's main line.
  const swing = materialSwing(moves, move.color);
  if (swing >= 2) parts.push(`The line wins about ${swing} points of material.`);
  else if (swing <= -2) parts.push(`It gives up about ${-swing} points of material for activity.`);

  if ("mate" in line.score && line.score.mate > 0) parts.push(`The engine finds mate in ${line.score.mate}.`);
  else if (runnerUp && "cp" in line.score && "cp" in runnerUp.score) {
    const gap = (line.score.cp - runnerUp.score.cp) / 100;
    if (gap >= 1) parts.push(`Clearly the best: the next option is ${gap.toFixed(1)} pawns worse.`);
  }
  return parts.join(" ");
}

function materialSwing(moves: Move[], mover: Color): number {
  let swing = 0;
  for (const move of moves) {
    const gained = (move.captured ? VALUE[move.captured] : 0) + (move.promotion ? VALUE[move.promotion] - 1 : 0);
    swing += move.color === mover ? gained : -gained;
  }
  return swing;
}

export interface Threats {
  /** Squares of the side to move's pieces that are in danger. */
  squares: Square[];
  warnings: string[];
}

/**
 * Static dangers to the side to move: pieces that hang (attacked and undefended,
 * or attacked by something cheaper), enemy pieces forking two of them, and pins.
 */
export function findThreats(fen: string): Threats {
  const chess = new Chess(fen);
  const us = chess.turn();
  const them: Color = us === "w" ? "b" : "w";
  const squares = new Set<Square>();
  const warnings: string[] = [];

  const targetsBy = new Map<Square, Square[]>();
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== us || cell.type === "k") continue;
      const attackers = chess.attackers(cell.square, them);
      if (attackers.length === 0) continue;
      const defended = chess.attackers(cell.square, us).length > 0;
      const cheapest = Math.min(...attackers.map((sq) => VALUE[chess.get(sq)!.type]));
      if (!defended || cheapest < VALUE[cell.type]) {
        squares.add(cell.square as Square);
        warnings.push(
          `Your ${name(cell.type)} on ${cell.square} is ${defended ? "attacked by a cheaper piece" : "hanging"}.`,
        );
      }
      for (const from of attackers) {
        targetsBy.set(from as Square, [...(targetsBy.get(from as Square) ?? []), cell.square as Square]);
      }
    }
  }

  // A fork: one enemy piece hitting two of ours worth more than itself (or undefended).
  for (const [from, targets] of targetsBy) {
    const attacker = chess.get(from as ChessSquare)!;
    const juicy = targets.filter(
      (sq) => VALUE[chess.get(sq as ChessSquare)!.type] > VALUE[attacker.type] || chess.attackers(sq as ChessSquare, us).length === 0,
    );
    const checking = chess.inCheck() && chess.attackers(chess.findPiece({ color: us, type: "k" })[0]!, them).includes(from as ChessSquare);
    if (juicy.length + (checking ? 1 : 0) >= 2) {
      const what = [...(checking ? ["king"] : []), ...juicy.map((sq) => name(chess.get(sq as ChessSquare)!.type))];
      warnings.push(`Fork: the ${name(attacker.type)} on ${from} hits your ${what.join(" and ")}.`);
      for (const sq of juicy) squares.add(sq);
    }
  }

  for (const [square, pin] of Object.entries(findPins(chess, us))) {
    const piece = chess.get(square as ChessSquare)!;
    warnings.push(`Your ${name(piece.type)} on ${square} is pinned to the king by the ${name(pin!.pinnerType)} on ${pin!.pinnedBy}.`);
  }

  return { squares: [...squares], warnings };
}

/** "12. Nf3 Nc6 13. d4" — SAN with move numbers, starting from `fen`. */
export function formatLine(fen: string, moves: Move[]): string {
  let number = Number(fen.split(" ")[5]) || 1;
  return moves
    .map((move, index) => {
      const text =
        move.color === "w" ? `${number}. ${move.san}` : index === 0 ? `${number}… ${move.san}` : move.san;
      if (move.color === "b") number++;
      return text;
    })
    .join(" ");
}
