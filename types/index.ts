import type { Color, PieceSymbol, Square } from "chess.js";

export type { Color, PieceSymbol, Square };

export interface Piece {
  color: Color;
  type: PieceSymbol;
}

/** A move that has been played, flattened out of the chess.js `Move` class. */
export interface PlayedMove {
  san: string;
  from: Square;
  to: Square;
  color: Color;
  piece: PieceSymbol;
  captured?: PieceSymbol;
  promotion?: PieceSymbol;
  isCapture: boolean;
  isEnPassant: boolean;
  isCastle: boolean;
  isCheck: boolean;
  isCheckmate: boolean;
}

/**
 * A legal move offered to the UI. `captureSquare` differs from `to` only for en
 * passant, where the captured pawn sits beside the destination rather than on it.
 */
export interface LegalMove {
  from: Square;
  to: Square;
  isCapture: boolean;
  isEnPassant: boolean;
  isCastle: boolean;
  isPromotion: boolean;
  captureSquare?: Square;
}

export type AssistanceMode = "beginner" | "medium" | "pro";

export type DrawReason =
  | "stalemate"
  | "threefold-repetition"
  | "fifty-move-rule"
  | "insufficient-material"
  | "agreement"
  | "timeout-insufficient-material";

export type WinReason = "checkmate" | "resignation" | "timeout";

export type GameResult =
  | { kind: "win"; winner: Color; reason: WinReason }
  | { kind: "draw"; reason: DrawReason };

export interface TimeControl {
  /** Starting time per player, in milliseconds. */
  initialMs: number;
  /** Increment added after each completed move, in milliseconds. */
  incrementMs: number;
}

/** How a game is played. Independent of `AssistanceMode`, which only sets board hints. */
export type GameMode = "online_random" | "online_room" | "offline_bot" | "offline_local";

/** Computer opponent strength. Not related to the Beginner/Medium/Pro assistance levels. */
export type BotDifficulty = "beginner" | "medium" | "pro";

export interface BotConfig {
  color: Color;
  difficulty: BotDifficulty;
}

export interface GameConfig {
  mode: AssistanceMode;
  /** Display names keyed by the colour each player controls. */
  players: Record<Color, string>;
  timeControl: TimeControl | null;
  /** Present when one side is played by the computer. */
  bot?: BotConfig;
}

export type BoardThemeId = "walnut" | "slate" | "sage" | "ivory";
export type PieceStyleId = "classic" | "minimal";

export interface GameSettings {
  sound: boolean;
  coordinates: boolean;
  animations: boolean;
  boardTheme: BoardThemeId;
  pieceStyle: PieceStyleId;
  showCaptured: boolean;
  showMoveHistory: boolean;
  showMaterial: boolean;
  allowUndo: boolean;
}

/** Per-mode assistance switches. These never affect which moves are legal. */
export interface AssistanceConfig {
  showLegalMoves: boolean;
  distinguishCaptures: boolean;
  highlightCaptureTargets: boolean;
  highlightSpecialMoves: boolean;
  showPinIndicator: boolean;
  coachMessages: boolean;
  pieceNames: boolean;
  checkEmphasis: "strong" | "clear" | "subtle";
  defaultAllowUndo: boolean;
}

export interface MaterialBalance {
  /** Pieces captured by each colour, ordered by descending value. */
  captured: Record<Color, PieceSymbol[]>;
  /** Positive when white leads. */
  advantage: number;
}
