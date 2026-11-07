import type { GameResult, LegalMove, Square } from "@/types";
import type { Position } from "./engine";
import type { PinInfo } from "./analysis";
import { PIECE_NAMES } from "@/constants/game";
import { colorName } from "./format";

export type CoachTone = "neutral" | "guide" | "warn" | "alert";

export interface CoachMessage {
  tone: CoachTone;
  text: string;
}

export interface CoachContext {
  position: Position;
  /** Effective result, including resignation, timeout and agreed draws. */
  result: GameResult | null;
  selected: Square | null;
  selectedMoves: LegalMove[];
  pins: Partial<Record<Square, PinInfo>>;
  checkers: Square[];
  awaitingPromotion: boolean;
  rejection: { from: Square; to: Square } | null;
}

/**
 * Beginner-mode narration. Purely explanatory: it describes the position that the
 * rules engine has already decided, and never suggests which move to play.
 */
export function getCoachMessage(context: CoachContext): CoachMessage {
  const { position, result, selected, selectedMoves, pins, checkers, awaitingPromotion, rejection } =
    context;

  if (awaitingPromotion) {
    return { tone: "alert", text: "Choose a promotion piece." };
  }

  if (result) {
    return { tone: "neutral", text: "The game is over." };
  }

  if (rejection) {
    return { tone: "warn", text: explainRejection(context, rejection) };
  }

  if (position.inCheck && !selected) {
    const text =
      checkers.length > 1
        ? "Double check — only a king move can escape."
        : `${colorName(position.turn)}'s king is in check. You must resolve it this move.`;
    return { tone: "alert", text };
  }

  if (selected) {
    const piece = position.pieceAt[selected];
    if (!piece) return idle(position);

    const name = PIECE_NAMES[piece.type];
    const pin = pins[selected];

    if (pin && selectedMoves.length === 0) {
      return {
        tone: "warn",
        text: `This ${name.toLowerCase()} is pinned by the ${PIECE_NAMES[
          pin.pinnerType
        ].toLowerCase()} on ${pin.pinnedBy}. Moving it would expose your king, so it cannot move.`,
      };
    }
    if (pin) {
      return {
        tone: "warn",
        text: `This ${name.toLowerCase()} is pinned by the ${PIECE_NAMES[
          pin.pinnerType
        ].toLowerCase()} on ${pin.pinnedBy}. It may only move along that line.`,
      };
    }
    if (selectedMoves.length === 0) {
      return {
        tone: "warn",
        text: position.inCheck
          ? `This ${name.toLowerCase()} cannot stop the check.`
          : `This ${name.toLowerCase()} has no legal moves.`,
      };
    }

    const extras: string[] = [];
    if (selectedMoves.some((move) => move.isCastle)) extras.push("castling is available");
    if (selectedMoves.some((move) => move.isEnPassant)) extras.push("en passant is available");
    const captures = selectedMoves.filter((move) => move.isCapture).length;
    if (captures > 0) extras.push(`${captures} capture${captures > 1 ? "s" : ""}`);

    const moveCount = `${selectedMoves.length} legal move${selectedMoves.length > 1 ? "s" : ""}`;
    const suffix = extras.length > 0 ? ` — ${extras.join(", ")}` : "";
    return { tone: "guide", text: `${name} on ${selected}: ${moveCount}${suffix}.` };
  }

  return idle(position);
}

function idle(position: Position): CoachMessage {
  if (position.history.length === 0) {
    return { tone: "neutral", text: "Select a piece to see everywhere it can legally move." };
  }
  return { tone: "neutral", text: `${colorName(position.turn)} to move.` };
}

function explainRejection(
  context: CoachContext,
  rejected: { from: Square; to: Square },
): string {
  const { position, pins } = context;
  const piece = position.pieceAt[rejected.from];
  if (!piece) return "That square has no piece to move.";

  if (piece.color !== position.turn) {
    return `It is ${colorName(position.turn)}'s turn.`;
  }

  if (piece.type === "k") {
    return `Your king would be in check on ${rejected.to}.`;
  }

  const pin = pins[rejected.from];
  if (pin) {
    return `Moving this ${PIECE_NAMES[piece.type].toLowerCase()} exposes your king to the ${PIECE_NAMES[
      pin.pinnerType
    ].toLowerCase()} on ${pin.pinnedBy}.`;
  }

  if (position.inCheck) {
    return "Your king is in check — that move does not stop it.";
  }

  return `A ${PIECE_NAMES[piece.type].toLowerCase()} cannot move to ${rejected.to} from ${rejected.from}.`;
}
