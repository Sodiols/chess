"use client";

import type { Color, GameResult } from "@/types";
import { describeResult, formatDuration } from "@/lib/chess/format";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

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
      <dl className="flex gap-6 border-y border-line py-3 text-sm">
        <div>
          <dt className="eyebrow">Moves</dt>
          <dd className="numeric mt-0.5">{fullMoves}</dd>
        </div>
        {durationMs !== null && (
          <div>
            <dt className="eyebrow">Duration</dt>
            <dd className="numeric mt-0.5">{formatDuration(durationMs)}</dd>
          </div>
        )}
        <div>
          <dt className="eyebrow">Result</dt>
          <dd className="numeric mt-0.5">
            {result.kind === "draw" ? "½–½" : result.winner === "w" ? "1–0" : "0–1"}
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
        <p className="text-center text-xs text-faint" aria-live="polite">
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
