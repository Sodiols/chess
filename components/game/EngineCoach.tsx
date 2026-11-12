"use client";

import clsx from "clsx";
import type { Color } from "@/types";
import type { SecretSettings } from "@/lib/secret/settings";
import { STRENGTHS, type EngineLine, type EngineUpdate } from "@/lib/secret/stockfish";
import { describeEval, explainLine, formatLine, formatScore, playUci, whitePawns, type Threats } from "@/lib/secret/insights";
import { Button } from "@/components/ui/Button";

export interface ReviewControls {
  ply: number;
  total: number;
  onGo: (ply: number) => void;
}

interface EngineCoachProps {
  fen: string;
  turn: Color;
  analysis: EngineUpdate | null;
  error: string | null;
  /** Shown instead of analysis, e.g. when the position has no legal moves. */
  notice?: string;
  settings: SecretSettings;
  threats: Threats | null;
  /** Engine-measured change caused by the last move, if large. */
  lastMoveNote: string | null;
  review?: ReviewControls;
  onStop: () => void;
  onRerun: () => void;
}

export function EngineCoach({
  fen,
  turn,
  analysis,
  error,
  notice,
  settings,
  threats,
  lastMoveNote,
  review,
  onStop,
  onRerun,
}: EngineCoachProps) {
  const lines = (analysis?.lines ?? []).filter((line) => line !== undefined);
  const best = lines[0];
  const running = analysis ? !analysis.done : !error;
  const progress = analysis ? Math.min(1, analysis.timeMs / analysis.movetimeMs) : 0;
  const shownLines = settings.topThree ? lines : settings.bestMove && best ? [best] : [];
  const mateAgainst = best && "mate" in best.score && best.score.mate < 0;

  return (
    <section aria-label="Engine coach" className="rounded-md bg-canvas/50 p-3 text-[0.8125rem] leading-snug">
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold tracking-wide text-accent uppercase">Engine coach</h2>
        <span className="numeric text-[0.6875rem] text-faint">
          {STRENGTHS[settings.strength].label}
          {analysis && ` · depth ${analysis.depth} · ${formatNodes(analysis.nodes)} nodes`}
        </span>
      </header>

      {notice ? (
        <p className="mt-2 text-muted">{notice}</p>
      ) : error ? (
        <div className="mt-2 space-y-2">
          <p role="alert" className="text-[#f2a79e]">{error}</p>
          <Button size="sm" onClick={onRerun}>Retry engine</Button>
        </div>
      ) : (
        <>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
              <div
                className={clsx("h-full bg-accent transition-[width] duration-150", !running && "opacity-40")}
                style={{ width: `${(running ? progress : 1) * 100}%` }}
              />
            </div>
            {running ? (
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onStop}>
                Stop
              </Button>
            ) : (
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onRerun}>
                Re-run
              </Button>
            )}
          </div>

          {best ? (
            <p className="mt-2">
              <span className="numeric text-lg font-bold text-ink">{formatScore(best.score, turn)}</span>{" "}
              <span className="text-muted">{describeEval(best.score, turn)}</span>
            </p>
          ) : (
            <p className="mt-2 text-muted">{running ? "Calculating…" : "No analysis for this position."}</p>
          )}

          {settings.bestMove && best && (
            <BestMove fen={fen} line={best} runnerUp={lines[1]} explain={settings.explanations} />
          )}

          {shownLines.length > 0 && (
            <ol className="mt-3 space-y-1.5">
              {shownLines.map((line) => (
                <CandidateLine key={line.multipv} fen={fen} turn={turn} line={line} showReply={settings.responses} />
              ))}
            </ol>
          )}

          {settings.threats && (mateAgainst || lastMoveNote || (threats && threats.warnings.length > 0)) && (
            <ul className="mt-3 space-y-1 border-t border-line pt-2 text-[#e8b57a]">
              {mateAgainst && (
                <li className="text-[#f2a79e]">
                  Mating danger: with best play the side to move is mated in {Math.abs((best.score as { mate: number }).mate)}.
                </li>
              )}
              {lastMoveNote && <li>{lastMoveNote}</li>}
              {threats?.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          )}

          <p className="mt-3 text-[0.6875rem] text-faint">
            Lines are the engine&apos;s calculated best play, not a prediction of what anyone will actually move.
          </p>
        </>
      )}

      {review && (
        <div className="mt-3 flex items-center gap-1 border-t border-line pt-2">
          <span className="numeric mr-auto text-xs text-muted">
            Review · move {review.ply} / {review.total}
          </span>
          {(
            [
              ["⏮", "First position", 0],
              ["◀", "Previous move", review.ply - 1],
              ["▶", "Next move", review.ply + 1],
              ["⏭", "Latest position", review.total],
            ] as const
          ).map(([icon, label, target]) => (
            <Button
              key={label}
              size="sm"
              variant="ghost"
              className="h-7 w-8 px-0"
              aria-label={label}
              disabled={target < 0 || target > review.total || target === review.ply}
              onClick={() => review.onGo(target)}
            >
              {icon}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}

function BestMove({ fen, line, runnerUp, explain }: { fen: string; line: EngineLine; runnerUp?: EngineLine; explain: boolean }) {
  const move = playUci(fen, line.pv.slice(0, 1))[0];
  if (!move) return null;
  return (
    <div className="mt-2 rounded bg-[#5fbf5a]/10 px-2.5 py-2">
      <p>
        <span className="text-muted">Best move </span>
        <span className="font-bold text-[#8fd88a]">{move.san}</span>
      </p>
      {explain && <p className="mt-1 text-muted">{explainLine(fen, line, runnerUp)}</p>}
    </div>
  );
}

function CandidateLine({ fen, turn, line, showReply }: { fen: string; turn: Color; line: EngineLine; showReply: boolean }) {
  const moves = playUci(fen, line.pv.slice(0, 10));
  if (moves.length === 0) return null;
  const reply = moves[1];
  return (
    <li className="rounded bg-surface/60 px-2.5 py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-ink">
          {line.multipv}. {moves[0]!.san}
          {showReply && reply && <span className="font-normal text-muted"> → reply {reply.san}</span>}
        </span>
        <span className={clsx("numeric shrink-0 text-xs", whitePawns(line.score, turn) >= 0 ? "text-ink" : "text-muted")}>
          {formatScore(line.score, turn)}
        </span>
      </div>
      <p className="numeric mt-0.5 truncate text-[0.6875rem] text-faint" title={formatLine(fen, moves)}>
        {formatLine(fen, moves)}
      </p>
    </li>
  );
}

function formatNodes(nodes: number): string {
  if (nodes >= 1e6) return `${(nodes / 1e6).toFixed(1)}M`;
  if (nodes >= 1e3) return `${Math.round(nodes / 1e3)}k`;
  return String(nodes);
}

/** Vertical evaluation bar; white's share fills from white's side of the board. */
export function EvalBar({ line, turn, orientation }: { line: EngineLine | undefined; turn: Color; orientation: Color }) {
  const pawns = line ? whitePawns(line.score, turn) : 0;
  const white = Math.round(100 / (1 + Math.exp(-0.45 * pawns)));
  return (
    <div
      role="img"
      aria-label={line ? `Evaluation ${formatScore(line.score, turn)}` : "Evaluation pending"}
      className={clsx(
        "relative w-3 shrink-0 overflow-hidden rounded-sm bg-[#26231f] ring-1 ring-white/10 sm:w-6",
        orientation === "b" && "rotate-180",
      )}
    >
      <div className="absolute inset-x-0 bottom-0 bg-[#f2eee6] transition-[height] duration-300" style={{ height: `${white}%` }} />
      {line && (
        <span
          className={clsx(
            "numeric absolute inset-x-0 hidden text-center text-[0.5625rem] font-bold sm:block",
            pawns >= 0 ? "bottom-0.5 text-[#26231f]" : "top-0.5 text-[#f2eee6]",
            orientation === "b" && "rotate-180",
          )}
        >
          {"mate" in line.score ? `#${Math.abs(line.score.mate)}` : Math.abs(pawns).toFixed(1)}
        </span>
      )}
    </div>
  );
}
