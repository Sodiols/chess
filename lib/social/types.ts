import type { Color, DrawReason, PieceSymbol, Square, WinReason } from "@/types";

export const countryCodes = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");
const regions = new Intl.DisplayNames(["en"], { type: "region" });
export const countries = countryCodes.map((code) => ({ code, name: regions.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name));
export const countryName = (code: string) => regions.of(code) ?? code;

export type Tier = "Bronze" | "Silver" | "Gold" | "Platinum" | "Diamond" | "Master";
export const ratingTier = (rating: number): Tier =>
  rating < 1000 ? "Bronze" : rating < 1400 ? "Silver" : rating < 1800 ? "Gold" : rating < 2100 ? "Platinum" : rating < 2400 ? "Diamond" : "Master";
export interface RankedPlayer {
  player_id: string;
  username: string;
  country_code: string | null;
  rating: number;
  peak: number;
  tier: Tier;
  wins: number;
  losses: number;
  draws: number;
  world_rank: number | null;
  country_rank: number | null;
}
export interface Standing extends RankedPlayer { position: number }
export interface PersonalStanding {
  rating: number;
  country_code: string | null;
  world_rank: number | null;
  country_rank: number | null;
  friends_rank: number | null;
  has_friends: boolean;
}
export interface PublicMatch { opponent: string; outcome: string; initial_ms: number; increment_ms: number; ended_at: string }
export interface PublicProfile { profile: RankedPlayer & { joined_at: string }; matches: PublicMatch[] }
export interface RatingChange { rating_before: number; rating_after: number; rating_change: number; rank_before: Tier; rank_after: Tier }
export interface SocialSettings { show_activity: boolean; allow_friends: boolean; allow_ranked: boolean }
export interface Presence { activity: "online" | "offline" | "online-game" | "computer" | "local" | "spectating"; watch?: string | null; topic?: string | null }
export const activityLabel: Record<Presence["activity"], string> = {
  online: "Online", offline: "Offline", "online-game": "Playing online", computer: "Playing computer",
  local: "Playing local 1v1", spectating: "Spectating",
};
export interface FriendDetails { status: "pending" | "accepted" | "declined" | "cancelled" | null; requester: string | null; presence: Presence | null }
export interface Friend extends FriendDetails { player_id: string; username: string; rating: number; tier: Tier; country_code: string | null }
export interface Invitation { id: string; host_name: string; name: string; initial_ms: number; increment_ms: number; ranked: boolean }
export interface FriendsResponse { people: Friend[]; invites: Invitation[] }
export interface NotificationItem { id: number; kind: string; message: string; href: string; read_at: string | null }
export interface SpectatorSnapshot {
  kind: "online" | "local" | "computer";
  board: {
    white: string; black: string; fen: string; turn: Color; sequence: number; disconnected?: boolean;
    whiteMs: number | null; blackMs: number | null; whiteRating?: number | null; blackRating?: number | null;
    turnStarted?: string; pausedAt?: string | null; status: "active" | "finished";
    result: "white" | "black" | "draw" | null; reason?: WinReason | DrawReason;
    moves: { from: Square; to: Square; promotion: PieceSymbol | null }[];
  };
  viewers: number;
  serverNow: string;
}
export const gameCount = (player: RankedPlayer) => player.wins + player.losses + player.draws;
export const winRate = (player: RankedPlayer) => gameCount(player) ? Math.round(100 * player.wins / gameCount(player)) : 0;
