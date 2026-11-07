"use client";

import { useMemo, useState } from "react";
import type { PlayedMove } from "@/types";
import { ChessEngine, type Position } from "@/lib/chess/engine";
import type { BoardOverlay } from "@/components/chess/ChessBoard";
import { findThreats, formatScore, playUci, whitePawns } from "@/lib/secret/insights";
import { cachedAnalysis, useEngineAnalysis } from "./useEngineAnalysis";
import { useSecretMode } from "./useSecretMode";

function replay(history: PlayedMove[], ply: number): Position {
  const engine = new ChessEngine();
  for (const move of history.slice(0, ply)) engine.move(move.from, move.to, move.promotion);
  return engine.snapshot();
}

/** A drop this large (in pawns) after one move is worth pointing out. */
const BLUNDER_PAWNS = 1.5;

/**
 * Secret Mode for one board, offline or online: the owner's engine analysis of
 * the live position, or of an earlier one while reviewing (`canReview`).
 * Everything stays in this browser. `awaitingServer` holds the search while an
 * online move is shown but not yet confirmed, so only official positions are
 * analysed. Everyone else gets `on: false` and the engine never loads.
 */
export function useSecretCoach(position: Position, canReview: boolean, awaitingServer = false) {
  const { isOwner, settings } = useSecretMode();
  const on = isOwner && settings.enabled;
  const [reviewPly, setReviewPly] = useState<number | null>(null);

  const history = position.history;
  const ply = on && canReview && reviewPly !== null && reviewPly < history.length ? reviewPly : null;
  const shown = useMemo(() => (ply === null ? position : replay(history, ply)), [history, ply, position]);
  const prevFen = useMemo(
    () => (on && shown.history.length > 0 ? replay(shown.history, shown.history.length - 1).fen : null),
    [on, shown.history],
  );

  const searchable = !shown.result && !(awaitingServer && ply === null);
  const { analysis, error, stop, rerun } = useEngineAnalysis(shown.fen, on, searchable, settings.strength);
  const lines = useMemo(() => (analysis?.lines ?? []).filter((line) => line !== undefined), [analysis]);

  const threats = useMemo(
    () => (on && settings.threats && !shown.result ? findThreats(shown.fen) : null),
    [on, settings.threats, shown.fen, shown.result],
  );

  const overlay = useMemo<BoardOverlay | undefined>(() => {
    if (!on) return undefined;
    const arrows = settings.arrows
      ? lines.flatMap((line, index) => {
          const wanted = index === 0 ? settings.bestMove || settings.topThree : settings.topThree;
          // Only drawn if chess.js accepts the move in this exact position.
          const move = wanted ? playUci(shown.fen, line.pv.slice(0, 1))[0] : undefined;
          return move ? [{ from: move.from, to: move.to, primary: index === 0 }] : [];
        })
        // Mid-search, two MultiPV slots can briefly hold the same move from different depths.
        .filter((arrow, index, all) => all.findIndex((other) => other.from === arrow.from && other.to === arrow.to) === index)
      : [];
    return { arrows, danger: threats?.squares ?? [] };
  }, [lines, on, settings.arrows, settings.bestMove, settings.topThree, shown.fen, threats]);

  // How much the last move changed the engine's verdict, once both positions are fully searched.
  let lastMoveNote: string | null = null;
  const before = prevFen ? cachedAnalysis(prevFen, settings.strength)?.lines[0] : undefined;
  const now = analysis?.done ? lines[0] : undefined;
  const last = shown.lastMove;
  if (before && now && last && prevFen) {
    const moverIsWhite = last.color === "w";
    const loss = (whitePawns(before.score, last.color) - whitePawns(now.score, shown.turn)) * (moverIsWhite ? 1 : -1);
    if (loss >= BLUNDER_PAWNS) {
      lastMoveNote = `${last.san} worsened the position for ${moverIsWhite ? "White" : "Black"}: ${formatScore(
        before.score,
        last.color,
      )} → ${formatScore(now.score, shown.turn)}.`;
    }
  }

  return {
    on,
    shown,
    reviewing: ply !== null,
    overlay,
    evalLine: on && settings.evalBar ? lines[0] : undefined,
    showEvalBar: on && settings.evalBar,
    coach: on
      ? {
          fen: shown.fen,
          turn: shown.turn,
          analysis,
          error,
          notice: shown.result
            ? "The game is over in this position; there is nothing to calculate."
            : awaitingServer && ply === null
              ? "Waiting for the server to confirm the move…"
              : undefined,
          settings,
          threats,
          lastMoveNote,
          review: canReview
            ? {
                ply: ply ?? history.length,
                total: history.length,
                onGo: (target: number) => setReviewPly(target >= history.length ? null : target),
              }
            : undefined,
          onStop: stop,
          onRerun: rerun,
        }
      : null,
  };
}
