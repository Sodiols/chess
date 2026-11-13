import type { Color, DrawReason, GameResult, PieceSymbol, Square, WinReason } from "@/types";

/** A `chess_games` row exactly as the database serialises it. */
export interface GameRow {
  id: string;
  origin: "matchmaking" | "room" | "rematch";
  ranked?: boolean;
  white_rating_before?: number | null;
  black_rating_before?: number | null;
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
  paused_at?: string | null;
  white_reconnect_by?: string | null;
  black_reconnect_by?: string | null;
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
  ranked?: boolean;
  allowSpectators?: boolean;
  players: 1 | 2;
  expiresAt: string;
  gameId: string | null;
}

export interface Profile {
  id: string;
  /** Display name stored on new games and rooms; equals `username` once one is set. */
  nickname: string;
  /** Null only for accounts that still have to choose one. */
  username: string | null;
  countryCode: string | null;
  activeGameId: string | null;
  createdAt: string;
}

export interface PlayerStats {
  played: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface RecentGame {
  id: string;
  color: Color;
  opponentName: string;
  outcome: "win" | "loss" | "draw";
  reason: WinReason | DrawReason;
  initialMs: number;
  incrementMs: number;
  endedAt: string;
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

/** Error codes shared by the database functions, the API routes and auth forms. */
const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "Your session has expired. Please log in again.",
  signed_out: "You're signed out. Log in to play online.",
  account_required: "Online play needs a Gambit account. Sign up or log in to continue.",
  not_configured: "Online play isn't configured on this server.",
  auth_unavailable: "Sign-in verification is temporarily unavailable. Try again.",
  room_setup_incomplete: "Room setup is incomplete. Apply the Competitive migration and reload the database schema.",
  setup_incomplete:
    "The server's database is missing Gambit's latest migration. The site owner needs to apply supabase/migrations (see SUPABASE.md).",
  rate_limited: "Too many requests. Wait a moment and try again.",
  timeout: "The server took too long to respond. Try again.",
  invalid_request: "That request wasn't valid.",
  invalid_time_control: "That time control isn't available online.",
  invalid_username: "Usernames are 3–20 letters, numbers or underscores, with no spaces.",
  username_reserved: "That username is reserved. Choose another.",
  username_taken: "That username is already taken.",
  invalid_email: "Enter a valid email address.",
  invalid_contact_name: "Enter your name (up to 80 characters).",
  invalid_contact_message: "Write a message of 10–4000 characters.",
  weak_password: "Use at least 8 characters for your password.",
  password_required: "Enter your password.",
  password_updated: "Password updated.",
  password_mismatch: "The passwords don't match.",
  invalid_credentials: "Incorrect email or password.",
  email_not_confirmed: "Confirm your email address first — check your inbox for the link.",
  email_taken: "An account with this email already exists. Log in instead.",
  same_password: "Choose a password different from your current one.",
  reauthentication_needed: "For security, request a password reset email to change your password.",
  invalid_link: "This link is invalid or has expired. Request a new one.",
  auth_disabled:
    "Email sign-ups are turned off for this Supabase project (Authentication → Sign In / Providers → Email).",
  username_check_failed: "Couldn't check that username right now. You can still try to create the account.",
  invalid_room_name: "Give the room a name of up to 40 characters.",
  invalid_password: "Room passwords are 4–64 characters.",
  invalid_color: "Choose White, Black or Random.",
  in_game: "You already have a game in progress. Finish or resume it first.",
  invalid_room_code: "Room IDs are 6 characters, like K7K2QX.",
  room_not_found: "No room exists with that ID.",
  own_room: "That's your own room — share the ID with your opponent.",
  room_full: "Room is full.",
  room_closed: "That room was closed by its host.",
  room_expired: "That room has expired.",
  wrong_password: "Invalid room password.",
  host_unavailable: "The host has started another game.",
  try_again: "Something went wrong. Please try again.",
  not_found: "Game not found.",
  not_participant: "You're not a player in this game.",
  not_your_turn: "It's not your turn.",
  stale: "The position changed. Syncing…",
  game_paused: "The game is paused while a player reconnects.",
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
