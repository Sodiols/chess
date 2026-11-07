"use client";

import { useEffect, useRef, useState } from "react";
import type { Square } from "@/types";
import { ChessEngine } from "@/lib/chess/engine";
import { toMovePairs } from "@/lib/chess/format";
import { ASSISTANCE } from "@/constants/assistance";
import { useGameSettings } from "@/hooks/useGameSettings";
import { ChessBoard } from "./ChessBoard";

/** The Ruy López, played out on the landing board. */
const LINE: [Square, Square][] = [
  ["e2", "e4"],
  ["e7", "e5"],
  ["g1", "f3"],
  ["b8", "c6"],
  ["f1", "b5"],
];

const START = new ChessEngine().snapshot();
const FIRST_MOVE_MS = 1500;
const MOVE_EVERY_MS = 900;
const TILT = 26;
const noop = () => {};

/**
 * The landing page's board: the real game board, in 3D, playing an opening by
 * itself once and leaning toward the pointer.
 */
export function HeroBoard() {
  const { settings } = useGameSettings();
  const stageRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(START);

  useEffect(() => {
    const engine = new ChessEngine();
    let ply = 0;
    let timer = window.setTimeout(function step() {
      const [from, to] = LINE[ply]!;
      engine.move(from, to);
      setPosition(engine.snapshot());
      ply += 1;
      if (ply < LINE.length) timer = window.setTimeout(step, MOVE_EVERY_MS);
    }, FIRST_MOVE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const lean = (event: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage || event.pointerType !== "mouse") return;
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

  return (
    <figure data-ui className="w-full">
      <div
        ref={stageRef}
        onPointerMove={lean}
        onPointerLeave={settle}
        role="img"
        aria-label="A chessboard playing the opening moves of the Ruy López"
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
            orientation="w"
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

      <figcaption className="mt-8 flex min-h-7 flex-wrap items-baseline justify-center gap-x-4 gap-y-1 text-base">
        <span className="font-semibold text-ink tabular-nums" aria-live="polite">
          {pairs.length === 0
            ? "1."
            : pairs
                .map(
                  (pair) =>
                    `${pair.number}. ${pair.white?.san ?? ""} ${pair.black?.san ?? ""}`,
                )
                .join("  ")}
        </span>
        <span
          className={
            position.history.length === LINE.length
              ? "text-accent transition-opacity duration-500"
              : "text-accent opacity-0"
          }
        >
          The Ruy López
        </span>
      </figcaption>
    </figure>
  );
}
