"use client";

import type { Color, GameResult } from "@/types";
import { describeResult, formatDuration } from "@/lib/chess/format";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ChessPiece } from "@/components/chess/ChessPiece";

interface GameResultDialogProps {
  open: boolean;
  result: GameResult;
  players: Record<Color, string>;
  moveCount: number;
  durationMs: number | null;
  onRematch: () => void;
  onNewGame: () => void;
  onHome: () => void;
  onDismiss: () => void;
  /** Online games: rematch is a request the opponent must accept. */
  rematchLabel?: string;
  rematchDisabled?: boolean;
  rematchNote?: string;
  onDeclineRematch?: () => void;
  newGameLabel?: string;
}

export function GameResultDialog({
  open,
  result,
  players,
  moveCount,
  durationMs,
  onRematch,
  onNewGame,
  onHome,
  onDismiss,
  rematchLabel = "Rematch",
  rematchDisabled = false,
  rematchNote = "Colours swap for the rematch.",
  onDeclineRematch,
  newGameLabel = "New game",
}: GameResultDialogProps) {
  const { headline, detail } = describeResult(result, players);
  const fullMoves = Math.ceil(moveCount / 2);

  return (
    <Dialog open={open} onClose={onDismiss} title={headline} description={detail}>
      {/* The two kings: the loser's tips over; in a draw both stand. */}
      <div aria-hidden className="-mt-1 mb-6 flex items-end justify-center gap-6 rounded-md bg-canvas/60 pt-5 pb-3">
        {(["w", "b"] as const).map((color) => (
          <span
            key={color}
            className={
              result.kind === "win" && result.winner !== color
                ? "block size-16 origin-[50%_88%] animate-topple"
                : "block size-16 animate-hop"
            }
          >
            <ChessPiece piece={{ color, type: "k" }} style="classic" />
          </span>
        ))}
      </div>

      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-md bg-line text-[0.9375rem]">
        <div className="bg-surface px-4 py-3">
          <dt className="text-sm text-muted">Result</dt>
          <dd className="mt-0.5 text-xl font-extrabold tabular-nums">
            {result.kind === "draw" ? "½–½" : result.winner === "w" ? "1–0" : "0–1"}
          </dd>
        </div>
        <div className="bg-surface px-4 py-3">
          <dt className="text-sm text-muted">Moves</dt>
          <dd className="mt-0.5 text-xl font-bold tabular-nums">{fullMoves}</dd>
        </div>
        <div className="bg-surface px-4 py-3">
          <dt className="text-sm text-muted">Duration</dt>
          <dd className="mt-0.5 text-xl font-bold tabular-nums">
            {durationMs !== null ? formatDuration(durationMs) : "—"}
          </dd>
        </div>
      </dl>

      <div className="mt-5 space-y-2">
        <Button
          variant="primary"
          size="lg"
          block
          onClick={onRematch}
          disabled={rematchDisabled}
          autoFocus
        >
          {rematchLabel}
        </Button>
        {onDeclineRematch && (
          <Button variant="ghost" block onClick={onDeclineRematch}>
            Decline rematch
          </Button>
        )}
        <p className="text-center text-sm text-faint" aria-live="polite">
          {rematchNote}
        </p>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button onClick={onNewGame}>{newGameLabel}</Button>
          <Button variant="ghost" onClick={onHome}>
            Home
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
