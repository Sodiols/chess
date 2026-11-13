import clsx from "clsx";
import { PIECE_NAMES } from "@/constants/game";
import type { Color, PlayedMove } from "@/types";

interface OnlineMoveStatusProps {
  phase: "finished" | "paused" | "sending" | "offline" | "your-turn" | "opponent-turn";
  opponent: string;
  myColor: Color;
  lastMove: PlayedMove | null;
  check: string | null;
}

export function OnlineMoveStatus({ phase, opponent, myColor, lastMove, check }: OnlineMoveStatusProps) {
  const title = {
    finished: "Match finished",
    paused: "Match paused",
    sending: "Confirming your move…",
    offline: "You’re offline",
    "your-turn": "Your turn",
    "opponent-turn": `Waiting for ${opponent} to move`,
  }[phase];

  return (
    <div role="status" aria-atomic="true" className={clsx(
      "flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-md border-s-4 px-3 py-2 text-sm",
      phase === "your-turn" ? "border-accent bg-accent-soft" : "border-line-strong bg-surface",
    )}>
      <p className="font-bold text-ink">
        {title}
        {check && <span className="ms-2 text-[#f2a79e]">· {check}</span>}
      </p>
      {phase === "sending" ? (
        <p className="text-muted">Waiting for the server</p>
      ) : lastMove && (
        <p className="text-muted">
          <span className="font-semibold text-ink">{lastMove.color === myColor ? "You moved" : `${opponent} moved`}</span>
          {" a "}{PIECE_NAMES[lastMove.piece].toLowerCase()} from {lastMove.from} to {lastMove.to}
          <span className="ms-2 tabular-nums">({lastMove.san})</span>
        </p>
      )}
    </div>
  );
}
