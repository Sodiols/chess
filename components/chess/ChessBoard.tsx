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
  /** Give computer moves more time to travel across the board. */
  computerColor?: Color;
  onSelect: (square: Square) => void;
  onMove: (from: Square, to: Square) => void;
  onClearSelection: () => void;
  /** Sets the pieces down one by one on first render (the landing board). */
  intro?: boolean;
  /** Purely visual engine guidance drawn above the pieces; never affects input. */
  overlay?: BoardOverlay;
}

export interface BoardOverlay {
  arrows: { from: Square; to: Square; primary: boolean }[];
  danger: Square[];
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
  computerColor,
  onSelect,
  onMove,
  onClearSelection,
  intro = false,
  overlay,
}: ChessBoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLDivElement>(null);
  const pressRef = useRef<{ square: Square; x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hoverTarget, setHoverTarget] = useState<Square | null>(null);
  const [focusedSquare, setFocusedSquare] = useState<Square>("e1");

  const theme = getBoardTheme(settings.boardTheme);
  const flipped = orientation === "b";
  const view3d = settings.board3d;

  // A captured piece stays on screen just long enough to be knocked off the board.
  // Derived during render (React's "previous props" pattern), cleared on animation end.
  const [prevPieces, setPrevPieces] = useState(position.pieces);
  const [taken, setTaken] = useState<Position["pieces"]>([]);
  if (prevPieces !== position.pieces) {
    setPrevPieces(position.pieces);
    const gone = prevPieces.filter((old) => !position.pieces.some((piece) => piece.id === old.id));
    // shortcut: only a single disappearance animates; resets and multi-ply jumps just snap.
    setTaken(settings.animations && gone.length === 1 ? gone : []);
  }

  /** Which piece's moves to advertise: the dragged one takes priority. */
  const activeSquare = drag?.from ?? selected;
  const activeMoves = useMemo(() => {
    if (!activeSquare) return [];
    if (activeSquare === selected) return selectedMoves;
    return position.movesFrom[activeSquare] ?? [];
  }, [activeSquare, position.movesFrom, selected, selectedMoves]);

  const squareAtPoint = useCallback(
    (clientX: number, clientY: number): Square | null => {
      // Ask the browser which square is under the pointer: it hit-tests through the
      // 3D tilt, where plain rectangle maths would land on the wrong rank.
      const hit = document.elementFromPoint?.(clientX, clientY)?.closest<HTMLElement>("[data-square]");
      if (hit && boardRef.current?.contains(hit)) return hit.dataset.square as Square;
      if (view3d) return null;

      const rect = boardRef.current?.getBoundingClientRect();
      if (!rect) return null;

      const column = Math.floor(((clientX - rect.left) / rect.width) * 8);
      const row = Math.floor(((clientY - rect.top) / rect.height) * 8);
      if (column < 0 || column > 7 || row < 0 || row > 7) return null;

      const file = flipped ? 7 - column : column;
      const rank = flipped ? 7 - row : row;
      return `${FILES[file]}${8 - rank}` as Square;
    },
    [flipped, view3d],
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

      const rect = drag ?? measureBoard(boardRef.current, cameraRef.current);
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
  const activePiece = activeSquare ? position.pieceAt[activeSquare] : undefined;
  const lastTo = position.lastMove?.to;
  const mated =
    position.result?.kind === "win" && position.result.reason === "checkmate"
      ? (position.result.winner === "w" ? "b" : "w")
      : null;

  /** Places a piece on its square; the extra half-turn keeps it upright when flipped. */
  const placement = (square: Square) =>
    `translate(${fileIndex(square) * 100}%, ${rankIndex(square) * 100}%)${flipped ? " rotate(180deg)" : ""}`;

  return (
    <div
      ref={cameraRef}
      className={clsx("relative w-full [container-type:inline-size]", view3d && "board-camera board-3d")}
      style={
        {
          "--board-light": theme.light,
          "--board-dark": theme.dark,
          "--board-rim": theme.rim,
          "--board-edge": theme.edge,
        } as React.CSSProperties
      }
    >
      <div className="board-slab">
        <div className="board-frame">
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
              "relative aspect-square w-full touch-none",
              view3d ? "[transform-style:preserve-3d]" : "overflow-hidden rounded-[3px]",
              settings.animations && "transition-transform duration-[600ms] ease-[cubic-bezier(0.65,0,0.35,1)]",
            )}
            style={{ transform: flipped ? "rotate(180deg)" : undefined }}
          >
            <div className="grid h-full w-full grid-cols-8 grid-rows-8 overflow-hidden rounded-[3px]">
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

            <div
              aria-hidden
              className="board-pieces pointer-events-none absolute inset-0"
              style={view3d ? { transform: "translateZ(1px)" } : undefined}
            >
              {position.pieces.map((piece, index) => (
                <div
                  key={piece.id}
                  className={clsx(
                    "board-piece absolute top-0 left-0 h-[12.5%] w-[12.5%]",
                    settings.animations && "transition-transform ease-[cubic-bezier(0.25,0.85,0.35,1)]",
                    settings.animations && (piece.color === computerColor ? "duration-[480ms]" : "duration-[220ms]"),
                    drag?.from === piece.square && "opacity-25",
                  )}
                  style={{ transform: placement(piece.square) }}
                >
                  {view3d && <span className="board-shadow" />}
                  <div className="board-stand size-full p-[4%]">
                    {/* Keyed by square so the hop replays on every move of this piece. */}
                    <div
                      key={piece.square}
                      className={clsx(
                        "size-full",
                        settings.animations && intro && "animate-drop",
                        settings.animations && !intro && lastTo === piece.square && "animate-hop",
                      )}
                      style={intro ? { animationDelay: `${180 + index * 22}ms` } : undefined}
                    >
                      {/* The shake lives on its own node so it cannot overwrite the
                          transforms that place and stand the piece. */}
                      <div
                        className={clsx(
                          "size-full origin-[50%_88%]",
                          rejection?.from === piece.square && "animate-shake",
                          settings.animations && piece.type === "k" && piece.color === mated && "animate-topple",
                        )}
                      >
                        <ChessPiece piece={piece} style={settings.pieceStyle} />
                      </div>
                    </div>
                  </div>

                  {assistance.pieceNames && !drag && piece.square === activeSquare && activePiece && (
                    <span className="absolute top-full left-1/2 z-10 -mt-[0.7rem] -translate-x-1/2 rounded-full bg-canvas/90 px-2 py-0.5 text-[0.75rem] font-semibold whitespace-nowrap text-ink">
                      {PIECE_NAMES[activePiece.type]}
                    </span>
                  )}
                </div>
              ))}

              {taken.map((piece) => (
                <div
                  key={`taken-${piece.id}`}
                  className="board-piece absolute top-0 left-0 h-[12.5%] w-[12.5%]"
                  style={{ transform: placement(piece.square) }}
                >
                  <div className="board-stand size-full p-[4%]">
                    <div className="size-full animate-taken" onAnimationEnd={() => setTaken([])}>
                      <ChessPiece piece={piece} style={settings.pieceStyle} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {overlay && <OverlayLayer overlay={overlay} lift={view3d} />}
          </div>
        </div>
      </div>

      {/* The drag ghost follows the pointer in screen space, outside the tilted slab. */}
      {drag && draggedPiece && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-20"
          style={{
            width: drag.size,
            height: drag.size,
            left: drag.x - drag.left - drag.size / 2,
            top: drag.y - drag.top - drag.size * 0.75,
          }}
        >
          <ChessPiece
            piece={draggedPiece}
            style={settings.pieceStyle}
            className="scale-[1.12] [filter:drop-shadow(0_14px_12px_rgba(0,0,0,0.55))]"
          />
        </div>
      )}
    </div>
  );
}

/**
 * Drawn in board coordinates inside the rotating board, so flipping and the 3D
 * tilt carry it along. pointer-events-none keeps every click and drag going to
 * the squares underneath.
 */
function OverlayLayer({ overlay, lift }: { overlay: BoardOverlay; lift: boolean }) {
  const centre = (square: Square) => [fileIndex(square) + 0.5, rankIndex(square) + 0.5] as const;
  return (
    <svg
      aria-hidden
      viewBox="0 0 8 8"
      className="pointer-events-none absolute inset-0 size-full"
      style={lift ? { transform: "translateZ(2px)" } : undefined}
    >
      {overlay.danger.map((square) => (
        <rect
          key={square}
          x={fileIndex(square) + 0.06}
          y={rankIndex(square) + 0.06}
          width={0.88}
          height={0.88}
          rx={0.08}
          fill="none"
          stroke="#e0584a"
          strokeWidth={0.07}
          opacity={0.9}
        />
      ))}
      {/* Secondary arrows first, so the best move is drawn on top. */}
      {[...overlay.arrows].reverse().map(({ from, to, primary }) => {
        const [x1, y1] = centre(from);
        const [x2, y2] = centre(to);
        const length = Math.hypot(x2 - x1, y2 - y1);
        const ux = (x2 - x1) / length;
        const uy = (y2 - y1) / length;
        const head = primary ? 0.42 : 0.34;
        const width = primary ? 0.17 : 0.11;
        const bx = x2 - ux * head;
        const by = y2 - uy * head;
        const color = primary ? "#5fbf5a" : "#7fa7d8";
        return (
          <g key={`${from}${to}`} opacity={primary ? 0.85 : 0.55}>
            <line x1={x1} y1={y1} x2={bx} y2={by} stroke={color} strokeWidth={width} strokeLinecap="round" />
            <polygon
              fill={color}
              points={`${x2},${y2} ${bx - uy * head * 0.6},${by + ux * head * 0.6} ${bx + uy * head * 0.6},${by - ux * head * 0.6}`}
            />
          </g>
        );
      })}
    </svg>
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
  board: HTMLDivElement | null,
  camera: HTMLDivElement | null,
): { left: number; top: number; size: number } | null {
  if (!board || !camera) return null;
  const rect = board.getBoundingClientRect();
  if (rect.width === 0) return null;
  const origin = camera.getBoundingClientRect();
  return { left: origin.left, top: origin.top, size: rect.width / 8 };
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
