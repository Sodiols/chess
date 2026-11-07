"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CHECKMATES } from "@/constants/openings";
import { ShowcaseBoard } from "./ShowcaseBoard";

/** How long a finished mate stays on screen before the next one starts. */
const HOLD_MS = 5000;

/** Any mate except the one just shown. */
function randomOther(current: number) {
  const next = Math.floor(Math.random() * (CHECKMATES.length - 1));
  return next >= current ? next + 1 : next;
}

/**
 * The home page board: plays a random famous checkmate, holds it, then plays a
 * different one. Each game remounts the board so it starts from a fresh setup.
 */
export function HeroBoard() {
  // Mate 0 on the server and first paint so hydration matches; a random one replaces it on mount.
  const [game, setGame] = useState({ run: 0, index: 0 });
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    // Swapped before the board's first move (1.5s in), so nobody sees mate 0 start.
    timer.current = window.setTimeout(() => setGame({ run: 1, index: Math.floor(Math.random() * CHECKMATES.length) }), 0);
    return () => window.clearTimeout(timer.current);
  }, []);

  const next = useCallback(() => {
    timer.current = window.setTimeout(() => setGame((g) => ({ run: g.run + 1, index: randomOther(g.index) })), HOLD_MS);
  }, []);

  return <ShowcaseBoard key={game.run} opening={CHECKMATES[game.index]} onFinish={next} />;
}
