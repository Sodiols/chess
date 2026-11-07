import type { Color, DrawReason, GameResult, PieceSymbol, Square, WinReason } from "@/types";

/** A `chess_games` row exactly as the database serialises it. */
export interface GameRow {
  id: string;
  origin: "matchmaking" | "room" | "rematch";
  room_id: string | null;
  white_id: string;
  black_id: string;
  white_name: string;
  black_name: string;
  status: "active" | "finished";
  turn: Color;
  fen: string;
  ply: number;
  version: number;
  initial_ms: number;
  increment_ms: number;
  white_ms: number;
  black_ms: number;
  turn_started_at: string;
  result: "white" | "black" | "draw" | null;
  result_reason: WinReason | DrawReason | null;
  draw_offered_by: string | null;
  rematch_requested_by: string | null;
  rematch_game_id: string | null;
  created_at: string;
  ended_at: string | null;
}

export interface MoveRow {
  game_id: string;
  ply: number;
  player_id: string;
  from_sq: Square;
  to_sq: Square;
  promotion: PieceSymbol | null;
  san: string;
  fen_after: string;
  clock_ms: number;
  request_id: string;
  created_at: string;
}

export interface GameSnapshot {
  game: GameRow;
  moves: MoveRow[];
  serverNow: string;
}

/** What the room browser and the host's waiting screen see. No secrets. */
export interface RoomSummary {
  code: string;
  name: string;
  hostName: string;
  initialMs: number;
  incrementMs: number;
  hostColor: Color | "random";
  status: "waiting" | "started" | "cancelled" | "expired";
  discoverable: boolean;
  players: 1 | 2;
  expiresAt: string;
  gameId: string | null;
}

export interface Profile {
  id: string;
  nickname: string;
  activeGameId: string | null;
}

export type GameAction =
  | "resign"
  | "offer_draw"
  | "accept_draw"
  | "decline_draw"
  | "claim_timeout"
  | "request_rematch"
  | "decline_rematch";

export const GAME_ACTIONS: readonly GameAction[] = [
  "resign",
  "offer_draw",
  "accept_draw",
  "decline_draw",
  "claim_timeout",
  "request_rematch",
  "decline_rematch",
];

/** Error codes shared by the database functions and the API routes. */
const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "Your session has expired. Reconnecting…",
  not_configured: "Online play isn't configured on this server.",
  guest_disabled:
    "Guest sign-in is turned off for this Supabase project. Enable anonymous sign-ins under Authentication → Sign In / Providers.",
  rate_limited: "Too many requests. Wait a moment and try again.",
  invalid_request: "That request wasn't valid.",
  invalid_time_control: "That time control isn't available online.",
  invalid_nickname: "Nicknames are 2–20 letters, numbers, spaces, dots, dashes or underscores.",
  invalid_room_name: "Give the room a name of up to 40 characters.",
  invalid_password: "Room passwords are 4–64 characters.",
  invalid_color: "Choose White, Black or Random.",
  in_game: "You already have a game in progress.",
  room_not_found: "No room exists with that ID.",
  own_room: "That's your own room — share the ID with your opponent.",
  room_full: "Room is full.",
  room_closed: "That room is no longer open.",
  wrong_password: "Invalid room password.",
  host_unavailable: "The host has started another game.",
  try_again: "Something went wrong. Please try again.",
  not_found: "Game not found.",
  not_participant: "You're not a player in this game.",
  not_your_turn: "It's not your turn.",
  stale: "The position changed. Syncing…",
  game_over: "This game has finished.",
  flagged: "Your time ran out.",
  illegal_move: "That move isn't legal.",
  already_offered: "You've already offered a draw.",
  no_offer: "There's no draw offer to answer.",
  game_active: "The game is still in progress.",
  opponent_busy: "Your opponent has started another game.",
  invalid_action: "That action isn't available.",
  network: "Connection problem. Check your internet and try again.",
};

export function errorMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.try_again!;
}

export function rowResult(game: Pick<GameRow, "result" | "result_reason">): GameResult | null {
  if (!game.result || !game.result_reason) return null;
  if (game.result === "draw") return { kind: "draw", reason: game.result_reason as DrawReason };
  return {
    kind: "win",
    winner: game.result === "white" ? "w" : "b",
    reason: game.result_reason as WinReason,
  };
}

export function colorOf(game: Pick<GameRow, "white_id" | "black_id">, playerId: string): Color | null {
  if (game.white_id === playerId) return "w";
  if (game.black_id === playerId) return "b";
  return null;
}
