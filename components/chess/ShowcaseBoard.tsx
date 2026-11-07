"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import clsx from "clsx";
import type { Color } from "@/types";
import { ChessEngine, opposite } from "@/lib/chess/engine";
import { colorName, toMovePairs } from "@/lib/chess/format";
import { ASSISTANCE } from "@/constants/assistance";
import { OPENINGS, type Opening } from "@/constants/openings";
import { useGameSettings } from "@/hooks/useGameSettings";
import { ChessBoard } from "./ChessBoard";
import { ChessPiece } from "./ChessPiece";

const START = new ChessEngine().snapshot();
const FIRST_MOVE_MS = 1500;
const MOVE_EVERY_MS = 900;
const TILT = 26;
const noop = () => {};

interface ShowcaseBoardProps {
  opening?: Opening;
  orientation?: Color;
  /** Shows the moves as they are played, then the opening's name. */
  caption?: boolean;
  /** Sweeps the camera slowly from side to side (a search in progress). */
  sweeping?: boolean;
  /** Called once the last move of the line has been played. */
  onFinish?: () => void;
  className?: string;
}

/**
 * The real game board, in 3D, playing an opening by itself once and leaning
 * toward the pointer. Board and piece style follow the player's settings.
 */
export function ShowcaseBoard({
  opening = OPENINGS.ruyLopez,
  orientation = "w",
  caption = true,
  sweeping = false,
  onFinish,
  className,
}: ShowcaseBoardProps) {
  const { settings } = useGameSettings();
  const stageRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(START);
  const finished = useEffectEvent(() => onFinish?.());

  useEffect(() => {
    const engine = new ChessEngine();
    let ply = 0;
    let timer = window.setTimeout(function step() {
      const [from, to] = opening.line[ply]!;
      engine.move(from, to);
      setPosition(engine.snapshot());
      ply += 1;
      if (ply < opening.line.length) timer = window.setTimeout(step, MOVE_EVERY_MS);
      else finished();
    }, FIRST_MOVE_MS);
    return () => window.clearTimeout(timer);
  }, [opening]);

  const lean = (event: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage || sweeping || event.pointerType !== "mouse") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = stage.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    stage.style.setProperty("--board-tilt", `${TILT + y * 10}deg`);
    stage.style.setProperty("--board-yaw", `${x * -10}deg`);
  };

  const settle = () => {
    stageRef.current?.style.setProperty("--board-tilt", `${TILT}deg`);
    stageRef.current?.style.setProperty("--board-yaw", "0deg");
  };

  const pairs = toMovePairs(position.history);
  const done = position.history.length === opening.line.length;
  const mate = position.result?.kind === "win" && position.result.reason === "checkmate" ? position.result : null;

  return (
    <figure data-ui className={clsx("w-full", className)}>
      <div className="relative">
        <div
          ref={stageRef}
          onPointerMove={lean}
          onPointerLeave={settle}
          role="img"
          aria-label={
            mate
              ? `A chessboard where ${colorName(mate.winner)} has delivered checkmate with ${opening.name}`
              : `A chessboard playing the opening moves of ${opening.name}`
          }
          className={clsx(sweeping && "animate-sweep")}
          style={{ "--board-tilt": `${TILT}deg` } as React.CSSProperties}
        >
          {/* Inert: a picture of a game, so its squares are not tab stops. */}
          <div inert>
            <ChessBoard
              position={position}
              selected={null}
              selectedMoves={[]}
              pins={{}}
              rejection={null}
              orientation={orientation}
              settings={{ ...settings, board3d: true, coordinates: false }}
              assistance={ASSISTANCE.pro}
              interactive={false}
              onSelect={noop}
              onMove={noop}
              onClearSelection={noop}
              intro={position.history.length === 0}
            />
          </div>
        </div>

        {mate && (
          // Lands after the mated king has started to tip over.
          <div
            role="status"
            className="pointer-events-none absolute inset-x-0 top-[18%] z-10 flex animate-enter justify-center px-4"
            style={{ animationDelay: "700ms" }}
          >
            <div className="flex items-center gap-4 rounded-xl border border-accent/40 bg-canvas/90 py-3.5 pr-6 pl-4 shadow-[0_18px_50px_rgba(0,0,0,0.55)] backdrop-blur-md">
              <span aria-hidden className="block size-11 shrink-0 origin-[50%_88%] animate-topple">
                <ChessPiece piece={{ color: opposite(mate.winner), type: "k" }} style="classic" />
              </span>
              <span>
                <span className="block text-[1.375rem] leading-tight font-extrabold text-accent">Checkmate!</span>
                <span className="block text-[0.9375rem] text-muted">
                  {colorName(mate.winner)} wins in {Math.ceil(position.history.length / 2)} moves
                </span>
              </span>
            </div>
          </div>
        )}
      </div>

      {caption && (
        <figcaption className="mt-8 flex min-h-7 flex-wrap items-baseline justify-center gap-x-4 gap-y-1 text-base">
          <span className="font-semibold text-ink tabular-nums" aria-live="polite">
            {pairs.length === 0
              ? "1."
              : pairs.map((pair) => `${pair.number}. ${pair.white?.san ?? ""} ${pair.black?.san ?? ""}`).join("  ")}
          </span>
          <span className={clsx("text-accent transition-opacity duration-500", !done && "opacity-0")}>
            {opening.name}
          </span>
        </figcaption>
      )}
    </figure>
  );
}
