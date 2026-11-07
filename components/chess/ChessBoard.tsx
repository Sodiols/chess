"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import type { AssistanceConfig, Color, GameSettings, LegalMove, Square } from "@/types";
import type { Position } from "@/lib/chess/engine";
import type { PinInfo } from "@/lib/chess/analysis";
import type { Rejection } from "@/hooks/useChessGame";
import { FILES, SQUARES, fileIndex, getBoardTheme, isLightSquare, rankIndex } from "@/constants/board";
import { PIECE_NAMES } from "@/constants/game";
import { ChessPiece } from "./ChessPiece";
import { ChessSquare, type SquareMarks } from "./ChessSquare";

/** Pointer travel, in px, before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD = 6;

interface DragState {
  from: Square;
  x: number;
  y: number;
  /** Board geometry captured when the drag began, so no render reads layout. */
  left: number;
  top: number;
  size: number;
}

interface ChessBoardProps {
  position: Position;
  selected: Square | null;
  selectedMoves: LegalMove[];
  pins: Partial<Record<Square, PinInfo>>;
  rejection: Rejection | null;
  orientation: Color;
  settings: GameSettings;
  assistance: AssistanceConfig;
  interactive: boolean;
  onSelect: (square: Square) => void;
  onMove: (from: Square, to: Square) => void;
  onClearSelection: () => void;
}

export function ChessBoard({
  position,
  selected,
  selectedMoves,
  pins,
  rejection,
  orientation,
  settings,
  assistance,
  interactive,
  onSelect,
  onMove,
  onClearSelection,
}: ChessBoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const pressRef = useRef<{ square: Square; x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hoverTarget, setHoverTarget] = useState<Square | null>(null);
  const [focusedSquare, setFocusedSquare] = useState<Square>("e1");

  const theme = getBoardTheme(settings.boardTheme);
  const flipped = orientation === "b";

  /** Which piece's moves to advertise: the dragged one takes priority. */
  const activeSquare = drag?.from ?? selected;
  const activeMoves = useMemo(() => {
    if (!activeSquare) return [];
    if (activeSquare === selected) return selectedMoves;
    return position.movesFrom[activeSquare] ?? [];
  }, [activeSquare, position.movesFrom, selected, selectedMoves]);

  const squareAtPoint = useCallback(
    (clientX: number, clientY: number): Square | null => {
      const rect = boardRef.current?.getBoundingClientRect();
      if (!rect) return null;

      const column = Math.floor(((clientX - rect.left) / rect.width) * 8);
      const row = Math.floor(((clientY - rect.top) / rect.height) * 8);
      if (column < 0 || column > 7 || row < 0 || row > 7) return null;

      const file = flipped ? 7 - column : column;
      const rank = flipped ? 7 - row : row;
      return `${FILES[file]}${8 - rank}` as Square;
    },
    [flipped],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!interactive || event.button !== 0) return;
      const square = squareAtPoint(event.clientX, event.clientY);
      if (!square) return;

      const piece = position.pieceAt[square];
      // Only the side to move can begin a drag; taps elsewhere still click through.
      if (piece?.color !== position.turn) return;

      // No pointer capture yet: Chromium sends the click that follows a captured
      // press to the capturing board instead of the square, which silently broke
      // click-to-select. Capture starts only once this becomes a drag.
      pressRef.current = { square, x: event.clientX, y: event.clientY };
    },
    [interactive, position.pieceAt, position.turn, squareAtPoint],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const press = pressRef.current;
      if (!press) return;

      if (!drag) {
        const travelled = Math.hypot(event.clientX - press.x, event.clientY - press.y);
        if (travelled < DRAG_THRESHOLD) return;
      }

      const rect = drag ?? measureBoard(boardRef.current);
      if (!rect) return;
      if (!drag) {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // The pointer can already be gone; the drag still works from bubbled events.
        }
      }

      setDrag({
        from: press.square,
        x: event.clientX,
        y: event.clientY,
        left: rect.left,
        top: rect.top,
        size: rect.size,
      });
      setHoverTarget(squareAtPoint(event.clientX, event.clientY));
    },
    [drag, squareAtPoint],
  );

  const endGesture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const press = pressRef.current;
      pressRef.current = null;

      if (drag && press) {
        const target = squareAtPoint(event.clientX, event.clientY);
        if (target && target !== press.square) {
          onMove(press.square, target);
          // The browser fires a click after the release; swallow it so the drop
          // is not immediately followed by a stray selection.
          suppressClickRef.current = true;
        }
      }

      setDrag(null);
      setHoverTarget(null);
    },
    [drag, onMove, squareAtPoint],
  );

  const handleClickCapture = useCallback((event: React.MouseEvent) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.stopPropagation();
    event.preventDefault();
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        onClearSelection();
        return;
      }

      const delta = ARROW_DELTAS[event.key];
      if (!delta) return;
      event.preventDefault();

      const sign = flipped ? -1 : 1;
      const file = clamp(fileIndex(focusedSquare) + delta[0] * sign);
      const rank = clamp(rankIndex(focusedSquare) + delta[1] * sign);
      const next = `${FILES[file]}${8 - rank}` as Square;

      setFocusedSquare(next);
      boardRef.current?.querySelector<HTMLButtonElement>(`[data-square="${next}"]`)?.focus();
    },
    [flipped, focusedSquare, onClearSelection],
  );

  const marksFor = useMemo(
    () =>
      buildMarks({
        position,
        selected,
        activeSquare,
        activeMoves,
        pins,
        rejection,
        assistance,
        hoverTarget,
      }),
    [activeMoves, activeSquare, assistance, hoverTarget, pins, position, rejection, selected],
  );

  const draggedPiece = drag ? position.pieceAt[drag.from] : undefined;

  return (
    <div
      className="relative w-full [container-type:inline-size]"
      style={
        {
          "--board-light": theme.light,
          "--board-dark": theme.dark,
        } as React.CSSProperties
      }
    >
      <div
        ref={boardRef}
        role="group"
        aria-label="Chess board"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onClickCapture={handleClickCapture}
        onKeyDown={handleKeyDown}
        className={clsx(
          "relative aspect-square w-full touch-none overflow-hidden rounded-md ring-1 ring-black/40",
          "shadow-[0_18px_50px_-24px_rgba(0,0,0,0.9)]",
          settings.animations && "transition-transform duration-[420ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
        )}
        style={{ transform: flipped ? "rotate(180deg)" : undefined }}
      >
        <div className="grid h-full w-full grid-cols-8 grid-rows-8">
          {SQUARES.map((square) => (
            <ChessSquare
              key={square}
              square={square}
              piece={position.pieceAt[square]}
              isLight={isLightSquare(square)}
              marks={marksFor[square] ?? EMPTY_MARKS}
              checkEmphasis={assistance.checkEmphasis}
              fileLabel={
                settings.coordinates && rankIndex(square) === (flipped ? 0 : 7)
                  ? square[0]
                  : undefined
              }
              rankLabel={
                settings.coordinates && fileIndex(square) === (flipped ? 7 : 0)
                  ? square[1]
                  : undefined
              }
              focusable={square === focusedSquare}
              onSelect={onSelect}
              onFocus={setFocusedSquare}
            />
          ))}
        </div>

        <div aria-hidden className="pointer-events-none absolute inset-0">
          {position.pieces.map((piece) => (
            <div
              key={piece.id}
              className={clsx(
                "absolute top-0 left-0 h-[12.5%] w-[12.5%] p-[3%]",
                settings.animations &&
                  "transition-transform duration-[190ms] ease-[cubic-bezier(0.25,0.85,0.35,1)]",
                drag?.from === piece.square && "opacity-25",
              )}
              style={{
                transform: `translate(${fileIndex(piece.square) * 100}%, ${
                  rankIndex(piece.square) * 100
                }%)${flipped ? " rotate(180deg)" : ""}`,
              }}
            >
              {/* The shake lives on an inner node so it cannot overwrite the
                  transform that places the piece on its square. */}
              <div
                className={clsx(
                  "size-full",
                  rejection?.from === piece.square && "animate-shake",
                )}
              >
                <ChessPiece piece={piece} style={settings.pieceStyle} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Coordinates and the drag ghost live outside the rotated board so they
          need no counter-rotation maths. */}
      {assistance.pieceNames && activeSquare && position.pieceAt[activeSquare] && !drag && (
        <span
          aria-hidden
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-full bg-canvas/85 px-2 py-0.5 text-[0.6875rem] font-semibold text-ink ring-1 ring-line"
          style={labelPosition(activeSquare, flipped)}
        >
          {PIECE_NAMES[position.pieceAt[activeSquare]!.type]}
        </span>
      )}

      {drag && draggedPiece && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-20"
          style={{
            width: drag.size,
            height: drag.size,
            left: drag.x - drag.left - drag.size / 2,
            top: drag.y - drag.top - drag.size / 2,
          }}
        >
          <ChessPiece
            piece={draggedPiece}
            style={settings.pieceStyle}
            className="scale-[1.08] [filter:drop-shadow(0_6px_10px_rgba(0,0,0,0.5))]"
          />
        </div>
      )}
    </div>
  );
}

const ARROW_DELTAS: Record<string, [number, number] | undefined> = {
  ArrowRight: [1, 0],
  ArrowLeft: [-1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const EMPTY_MARKS: SquareMarks = {
  selected: false,
  lastMove: false,
  legalQuiet: false,
  legalCapture: false,
  legalSpecial: false,
  captureTarget: false,
  check: false,
  pinned: false,
  dragTarget: false,
  rejected: false,
};

function clamp(value: number): number {
  return Math.min(7, Math.max(0, value));
}

function measureBoard(
  element: HTMLDivElement | null,
): { left: number; top: number; size: number } | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0) return null;
  return { left: rect.left, top: rect.top, size: rect.width / 8 };
}

/** Positions the Beginner name chip just below the piece it describes. */
function labelPosition(square: Square, flipped: boolean): React.CSSProperties {
  const file = flipped ? 7 - fileIndex(square) : fileIndex(square);
  const rank = flipped ? 7 - rankIndex(square) : rankIndex(square);
  return {
    left: `${(file + 0.5) * 12.5}%`,
    top: `${(rank + 1) * 12.5}%`,
    marginTop: "-0.7rem",
  };
}

interface MarkInput {
  position: Position;
  selected: Square | null;
  activeSquare: Square | null;
  activeMoves: LegalMove[];
  pins: Partial<Record<Square, PinInfo>>;
  rejection: Rejection | null;
  assistance: AssistanceConfig;
  hoverTarget: Square | null;
}

/**
 * Turns game state into per-square visual state. This is the only place where the
 * assistance mode is allowed to change what the player sees.
 */
function buildMarks(input: MarkInput): Partial<Record<Square, SquareMarks>> {
  const {
    position,
    selected,
    activeSquare,
    activeMoves,
    pins,
    rejection,
    assistance,
    hoverTarget,
  } = input;

  const marks: Partial<Record<Square, SquareMarks>> = {};
  const mark = (square: Square): SquareMarks => (marks[square] ??= { ...EMPTY_MARKS });

  if (activeSquare) mark(activeSquare).selected = true;
  if (hoverTarget) mark(hoverTarget).dragTarget = true;

  const last = position.lastMove;
  if (last) {
    mark(last.from).lastMove = true;
    mark(last.to).lastMove = true;
  }

  if (position.checkSquare) mark(position.checkSquare).check = true;

  if (rejection) {
    mark(rejection.from).rejected = true;
    if (rejection.to !== rejection.from) mark(rejection.to).rejected = true;
  }

  if (assistance.showPinIndicator && selected && pins[selected]) {
    mark(selected).pinned = true;
  }

  if (assistance.showLegalMoves && activeSquare) {
    for (const move of activeMoves) {
      const target = mark(move.to);
      const special =
        assistance.highlightSpecialMoves && (move.isCastle || move.isEnPassant);

      if (special) target.legalSpecial = true;
      else if (move.isCapture && assistance.distinguishCaptures) target.legalCapture = true;
      else target.legalQuiet = true;

      if (assistance.highlightCaptureTargets && move.captureSquare) {
        mark(move.captureSquare).captureTarget = true;
      }
    }
  }

  return marks;
}
