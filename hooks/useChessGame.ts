"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type {
  AssistanceConfig,
  Color,
  GameConfig,
  GameResult,
  GameSettings,
  LegalMove,
  MaterialBalance,
  PieceSymbol,
  Square,
} from "@/types";
import { ChessEngine, opposite, type Position } from "@/lib/chess/engine";
import { findCheckers, findPins, type PinInfo } from "@/lib/chess/analysis";
import { computeMaterial, resultFromFlagFall } from "@/lib/chess/material";
import { getCoachMessage, type CoachMessage } from "@/lib/chess/coach";
import { ASSISTANCE } from "@/constants/assistance";
import { resolveSquareClick } from "@/lib/chess/selection";
import { playSound, type SoundName } from "@/lib/sound";
import { useChessTimer } from "./useChessTimer";
import type { ChessClock } from "@/lib/clock";

interface PendingPromotion {
  from: Square;
  to: Square;
}

export interface Rejection {
  from: Square;
  to: Square;
  /** Bumped on every rejection so a repeated attempt replays the shake. */
  token: number;
}

interface GameState {
  position: Position;
  selected: Square | null;
  pendingPromotion: PendingPromotion | null;
  rejection: Rejection | null;
  /** Results that cannot be read off the board: resignation, timeout, agreement. */
  manualResult: GameResult | null;
  /**
   * Colour shown at the bottom. White unless a player flips the board, and only
   * the flip control ever changes it — the board never rotates on its own.
   */
  orientation: Color;
  paused: boolean;
  drawOffer: Color | null;
  /** Wall-clock length of the game, recorded once it ends. */
  durationMs: number | null;
}

type Action =
  | { type: "select"; square: Square | null }
  | { type: "reject"; from: Square; to: Square }
  | { type: "dismissRejection" }
  | { type: "pendingPromotion"; from: Square; to: Square }
  | { type: "cancelPromotion" }
  | { type: "commit"; position: Position; elapsedMs: number }
  | { type: "finish"; result: GameResult; elapsedMs: number }
  | { type: "setOrientation"; color: Color }
  | { type: "setPaused"; paused: boolean }
  | { type: "offerDraw"; color: Color }
  | { type: "clearDrawOffer" };

function createInitialState(engine: ChessEngine): GameState {
  return {
    position: engine.snapshot(),
    selected: null,
    pendingPromotion: null,
    rejection: null,
    manualResult: null,
    orientation: "w",
    paused: false,
    drawOffer: null,
    durationMs: null,
  };
}

function isFinished(state: GameState): boolean {
  return state.manualResult !== null || state.position.result !== null;
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "select":
      return { ...state, selected: action.square, rejection: null };

    case "reject":
      return {
        ...state,
        rejection: { from: action.from, to: action.to, token: (state.rejection?.token ?? 0) + 1 },
      };

    case "dismissRejection":
      return state.rejection ? { ...state, rejection: null } : state;

    case "pendingPromotion":
      return {
        ...state,
        pendingPromotion: { from: action.from, to: action.to },
        selected: action.from,
        rejection: null,
      };

    case "cancelPromotion":
      return { ...state, pendingPromotion: null };

    case "commit":
      // A game already decided off the board accepts no further positions.
      if (state.manualResult) return state;
      return {
        ...state,
        position: action.position,
        selected: null,
        pendingPromotion: null,
        rejection: null,
        drawOffer: null,
        durationMs: action.position.result ? action.elapsedMs : null,
      };

    case "finish":
      // Guards against a second result arriving from, say, a flag fall that races
      // a resignation.
      if (isFinished(state)) return state;
      return {
        ...state,
        manualResult: action.result,
        selected: null,
        pendingPromotion: null,
        drawOffer: null,
        durationMs: action.elapsedMs,
      };

    case "setOrientation":
      return { ...state, orientation: action.color };

    case "setPaused":
      return { ...state, paused: action.paused, selected: null };

    case "offerDraw":
      return { ...state, drawOffer: action.color, selected: null };

    case "clearDrawOffer":
      return { ...state, drawOffer: null };
  }
}

interface ChessGameApi {
  position: Position;
  selected: Square | null;
  selectedMoves: LegalMove[];
  pins: Partial<Record<Square, PinInfo>>;
  checkers: Square[];
  material: MaterialBalance;
  coach: CoachMessage | null;
  result: GameResult | null;
  orientation: Color;
  paused: boolean;
  drawOffer: Color | null;
  pendingPromotion: PendingPromotion | null;
  rejection: Rejection | null;
  assistance: AssistanceConfig;
  clock: ChessClock | null;
  /** True when the board should accept input. */
  isInteractive: boolean;
  canUndo: boolean;
  durationMs: number | null;
  selectSquare: (square: Square) => void;
  attemptMove: (from: Square, to: Square) => void;
  choosePromotion: (piece: PieceSymbol) => void;
  cancelPromotion: () => void;
  clearSelection: () => void;
  undo: () => void;
  /** Plays a move without the click flow; used by the computer opponent. */
  playMove: (from: Square, to: Square, promotion?: PieceSymbol) => void;
  flipBoard: () => void;
  togglePause: () => void;
  resign: (color: Color) => void;
  offerDraw: (color: Color) => void;
  respondToDrawOffer: (accept: boolean) => void;
}

export function useChessGame(config: GameConfig, settings: GameSettings): ChessGameApi {
  const [engine] = useState(() => new ChessEngine());
  // Against the computer the human's side starts at the bottom.
  const [state, dispatch] = useReducer(reducer, engine, (start) => ({
    ...createInitialState(start),
    orientation: config.bot ? opposite(config.bot.color) : "w",
  }));

  const assistance = ASSISTANCE[config.mode];
  const result = state.manualResult ?? state.position.result;

  /** Clock readings taken immediately before each move, used to rewind on undo. */
  const clockHistory = useRef<Record<Color, number>[]>([]);

  /**
   * A committed mirror of the values the clock callback needs. The clock fires from
   * a timer rather than a render, so reading the latest commit is always correct.
   */
  const latest = useRef({ position: state.position, result, sound: settings.sound, startedAt: 0 });
  useEffect(() => {
    latest.current.position = state.position;
    latest.current.result = result;
    latest.current.sound = settings.sound;
  });
  useEffect(() => {
    latest.current.startedAt = Date.now();
  }, []);

  const elapsed = useCallback(() => Date.now() - latest.current.startedAt, []);

  const cue = useCallback((name: SoundName) => {
    if (latest.current.sound) playSound(name);
  }, []);

  const handleFlag = useCallback(
    (color: Color) => {
      if (latest.current.result) return;
      const flagResult = resultFromFlagFall(latest.current.position.pieceAt, color);
      dispatch({ type: "finish", result: flagResult, elapsedMs: elapsed() });
      cue("gameEnd");
    },
    [cue, elapsed],
  );

  const clock = useChessTimer(config.timeControl, handleFlag);

  useEffect(() => {
    clock?.start("w");
  }, [clock]);

  const botColor = config.bot?.color ?? null;
  const isInteractive =
    result === null &&
    !state.paused &&
    state.pendingPromotion === null &&
    state.drawOffer === null &&
    state.position.turn !== botColor;

  const finish = useCallback(
    (finalResult: GameResult) => {
      clock?.stop();
      dispatch({ type: "finish", result: finalResult, elapsedMs: elapsed() });
      cue("gameEnd");
    },
    [clock, cue, elapsed],
  );

  const applyMove = useCallback(
    (from: Square, to: Square, promotion?: PieceSymbol) => {
      // Reading the clock also settles it, which can drop the mover's flag on this
      // very tick. If it does, the flag handler has already ended the game and the
      // move must not land.
      const clockBefore = clock?.getRemaining() ?? null;
      if (clockBefore && clockBefore[state.position.turn] <= 0) return;

      const played = engine.move(from, to, promotion);

      if (!played) {
        dispatch({ type: "reject", from, to });
        cue("illegal");
        return;
      }

      if (clockBefore) clockHistory.current.push(clockBefore);
      const position = engine.snapshot();

      if (position.result) {
        clock?.stop();
        cue("gameEnd");
      } else {
        clock?.moveCompleted(played.color);
        cue(
          played.promotion
            ? "promote"
            : played.isCastle
              ? "castle"
              : played.isCheck
                ? "check"
                : played.isCapture
                  ? "capture"
                  : "move",
        );
      }

      dispatch({ type: "commit", position, elapsedMs: elapsed() });
    },
    [clock, cue, elapsed, engine, state.position.turn],
  );

  const attemptMove = useCallback(
    (from: Square, to: Square) => {
      if (!isInteractive) return;

      const move = state.position.movesFrom[from]?.find((candidate) => candidate.to === to);
      if (!move) {
        dispatch({ type: "reject", from, to });
        cue("illegal");
        return;
      }
      if (move.isPromotion) {
        dispatch({ type: "pendingPromotion", from, to });
        clock?.pause();
        return;
      }
      applyMove(from, to);
    },
    [applyMove, clock, cue, isInteractive, state.position],
  );

  const selectSquare = useCallback(
    (square: Square) => {
      if (!isInteractive) return;
      const outcome = resolveSquareClick(state.position, state.selected, square);
      if (outcome.kind === "select") dispatch({ type: "select", square: outcome.square });
      else if (outcome.kind === "move") attemptMove(outcome.from, outcome.to);
      else if (outcome.kind === "reject") {
        dispatch({ type: "reject", from: outcome.from, to: outcome.to });
        cue("illegal");
      }
    },
    [attemptMove, cue, isInteractive, state.position, state.selected],
  );

  const choosePromotion = useCallback(
    (piece: PieceSymbol) => {
      const pending = state.pendingPromotion;
      if (!pending) return;
      clock?.resume();
      applyMove(pending.from, pending.to, piece);
    },
    [applyMove, clock, state.pendingPromotion],
  );

  const cancelPromotion = useCallback(() => {
    clock?.resume();
    dispatch({ type: "cancelPromotion" });
  }, [clock]);

  // Against the computer an undo takes back its reply too, returning the turn to
  // the human; it is only offered while the human is to move.
  const undoSteps = botColor ? 2 : 1;
  const canUndo =
    settings.allowUndo && isInteractive && state.position.history.length >= undoSteps;

  const undo = useCallback(() => {
    if (!canUndo) return;
    for (let step = 0; step < undoSteps; step++) {
      const played = engine.undo();
      if (!played) break;
      const restored = clockHistory.current.pop();
      if (clock && restored) clock.restore(restored, played.color);
    }

    dispatch({ type: "commit", position: engine.snapshot(), elapsedMs: elapsed() });
  }, [canUndo, clock, elapsed, engine, undoSteps]);

  const playMove = useCallback(
    (from: Square, to: Square, promotion?: PieceSymbol) => {
      if (result || state.paused) return;
      applyMove(from, to, promotion);
    },
    [applyMove, result, state.paused],
  );

  const flipBoard = useCallback(() => {
    dispatch({ type: "setOrientation", color: opposite(state.orientation) });
  }, [state.orientation]);

  const togglePause = useCallback(() => {
    if (!clock || result) return;
    if (state.paused) {
      clock.resume();
      dispatch({ type: "setPaused", paused: false });
    } else {
      clock.pause();
      dispatch({ type: "setPaused", paused: true });
    }
  }, [clock, result, state.paused]);

  const resign = useCallback(
    (color: Color) => finish({ kind: "win", winner: opposite(color), reason: "resignation" }),
    [finish],
  );

  const offerDraw = useCallback((color: Color) => {
    dispatch({ type: "offerDraw", color });
  }, []);

  const respondToDrawOffer = useCallback(
    (accept: boolean) => {
      if (accept) finish({ kind: "draw", reason: "agreement" });
      else dispatch({ type: "clearDrawOffer" });
    },
    [finish],
  );

  const clearSelection = useCallback(() => dispatch({ type: "select", square: null }), []);

  // A rejection is a transient cue; it clears itself so stale warnings never linger.
  useEffect(() => {
    if (!state.rejection) return;
    const timer = setTimeout(() => dispatch({ type: "dismissRejection" }), 2400);
    return () => clearTimeout(timer);
  }, [state.rejection]);

  const selectedMoves = useMemo(
    () => (state.selected ? (state.position.movesFrom[state.selected] ?? []) : []),
    [state.position, state.selected],
  );

  const pins = useMemo(
    () => (assistance.showPinIndicator ? findPins(engine.raw(), state.position.turn) : {}),
    [assistance.showPinIndicator, engine, state.position],
  );

  const checkers = useMemo(
    () => (state.position.inCheck ? findCheckers(engine.raw(), state.position.turn) : []),
    [engine, state.position],
  );

  const material = useMemo(
    () => computeMaterial(state.position.history, state.position.pieceAt),
    [state.position],
  );

  const coach = useMemo(() => {
    if (!assistance.coachMessages) return null;
    return getCoachMessage({
      position: state.position,
      result,
      selected: state.selected,
      selectedMoves,
      pins,
      checkers,
      awaitingPromotion: state.pendingPromotion !== null,
      rejection: state.rejection,
    });
  }, [
    assistance.coachMessages,
    checkers,
    pins,
    result,
    selectedMoves,
    state.pendingPromotion,
    state.position,
    state.rejection,
    state.selected,
  ]);

  return {
    position: state.position,
    selected: state.selected,
    selectedMoves,
    pins,
    checkers,
    material,
    coach,
    result,
    orientation: state.orientation,
    paused: state.paused,
    drawOffer: state.drawOffer,
    pendingPromotion: state.pendingPromotion,
    rejection: state.rejection,
    assistance,
    clock,
    isInteractive,
    canUndo,
    durationMs: state.durationMs,
    selectSquare,
    attemptMove,
    choosePromotion,
    cancelPromotion,
    clearSelection,
    undo,
    playMove,
    flipBoard,
    togglePause,
    resign,
    offerDraw,
    respondToDrawOffer,
  };
}
