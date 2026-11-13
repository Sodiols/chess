"use client";

import { useEffect, useRef, useState } from "react";
import type { BotConfig, PieceSymbol, Square } from "@/types";
import { BotClient } from "@/lib/computer/botClient";
import { BOT_DIFFICULTIES } from "@/lib/computer/difficulty";

interface BotGame {
  fen: string;
  turn: "w" | "b";
  finished: boolean;
  paused: boolean;
  playMove: (from: Square, to: Square, promotion?: PieceSymbol) => void;
}

/**
 * Plays the computer's moves. A request is tied to the exact position it was
 * asked about: if the position changes (undo, restart, game end, pause) before
 * the answer arrives, the effect's cleanup cancels it, so a stale move can
 * never land. Returns whether the computer is on move.
 */
export function useComputerOpponent(bot: BotConfig | undefined, game: BotGame): boolean {
  const [client] = useState(() => (bot ? new BotClient() : null));
  const playRef = useRef(game.playMove);
  useEffect(() => {
    playRef.current = game.playMove;
  });

  useEffect(() => () => client?.dispose(), [client]);

  const onMove = Boolean(bot) && game.turn === bot?.color && !game.finished;
  const active = onMove && !game.paused;
  const difficulty = bot?.difficulty;

  useEffect(() => {
    if (!client || !active || !difficulty) return;
    let cancelled = false;
    const startedAt = performance.now();
    const { replyDelayMs } = BOT_DIFFICULTIES[difficulty];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const request = client.request(game.fen, difficulty);

    void request.promise.then((move) => {
      if (cancelled || !move) return;
      const wait = Math.max(0, replyDelayMs - (performance.now() - startedAt));
      timer = setTimeout(() => {
        playRef.current(move.from, move.to, move.promotion);
      }, wait);
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      request.cancel();
    };
  }, [active, client, difficulty, game.fen]);

  return onMove;
}
