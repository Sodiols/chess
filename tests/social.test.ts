import { Chess } from "chess.js";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sanitizeBoard } from "@/lib/social/snapshot";
import { asUser, createDatabase, createUser, rpc } from "./db/harness";

let db: PGlite;
let names = 0;
const player = () => createUser(db, { username: `social_player_${++names}` });
const room = async (host: string, ranked: boolean, spectators = false) =>
  (await rpc<{ room: { code: string; ranked: boolean } }>(db, "create_configured_room",
    [host, "Weekend chess", "roomsecret", 300000, 0, "w", false, ranked, spectators])).room;
const join = async (guest: string, code: string) =>
  (await rpc<{ gameId: string }>(db, "join_room", [guest, code, "roomsecret"])).gameId;
const friends = async (a: string, b: string) => {
  await rpc(db, "friend_action", [a, b, "request"]);
  expect(await rpc(db, "friend_action", [b, a, "accept"])).toMatchObject({ ok: true });
};
const prefs = (id: string, enabled = true) => rpc(db, "social_settings", [id,
  JSON.stringify({ show_activity: true, allow_friends: enabled, allow_ranked: enabled })]);

beforeAll(async () => { db = await createDatabase(); }, 60_000);
afterAll(async () => { await db?.close(); });

describe("competitive rating", () => {
  it("uses all tier bases, bounded strength adjustments and neutral higher-tier draws", async () => {
    const { rows } = await db.query(`select rating, public.rank_tier(rating) as tier,
      public.rating_delta(rating,rating,'win') as win, public.rating_delta(rating,rating,'draw') as draw,
      public.rating_delta(rating,rating,'loss') as loss from unnest(array[999,1000,1400,1800,2100,2400]) rating`);
    expect(rows).toEqual([
      { rating: 999, tier: "Bronze", win: 26, draw: 4, loss: -8 },
      { rating: 1000, tier: "Silver", win: 20, draw: 2, loss: -10 },
      { rating: 1400, tier: "Gold", win: 16, draw: 0, loss: -13 },
      { rating: 1800, tier: "Platinum", win: 13, draw: 0, loss: -16 },
      { rating: 2100, tier: "Diamond", win: 10, draw: 0, loss: -20 },
      { rating: 2400, tier: "Master", win: 7, draw: 0, loss: -24 },
    ]);
    expect((await db.query("select public.rating_delta(1000,3000,'win') as win,public.rating_delta(1000,0,'loss') as loss")).rows)
      .toEqual([{ win: 26, loss: -16 }]);
  });

  it("settles ranked matchmaking resignation exactly once, then exposes safe standings", async () => {
    const a = await player(); const b = await player();
    await rpc(db, "matchmake", [a, 180000, 0]);
    const { gameId } = await rpc<{ gameId: string }>(db, "matchmake", [b, 180000, 0]);
    await rpc(db, "game_action", [gameId, b, "resign"]);
    await rpc(db, "game_action", [gameId, b, "resign"]);
    expect(await rpc(db, "game_rating_result", [gameId, a])).toMatchObject({ rating: { rating_before: 1000, rating_after: 1020 } });
    expect(await rpc(db, "game_rating_result", [gameId, b])).toMatchObject({ rating: { rating_after: 990, rank_after: "Bronze" } });
    expect(await rpc(db, "set_country", [a, "BD"])).toMatchObject({ ok: true });
    expect(await rpc(db, "set_country", [a, "US"])).toMatchObject({ error: "country_cooldown" });
    expect(await rpc(db, "set_country", [b, "ZZ"])).toMatchObject({ error: "invalid_country" });
    expect(await rpc(db, "leaderboard", [null, "world", null, "", 0])).toMatchObject({
      rows: [{ player_id: a, position: 1, rating: 1020 }, { player_id: b, position: 2, rating: 990 }],
    });
    expect(await rpc(db, "leaderboard", [null, "country", "BD", "", 0])).toMatchObject({
      rows: [{ player_id: a, position: 1, world_rank: 1 }],
    });
    expect(await rpc(db, "leaderboard", [null, "friends", null, "", 0])).toMatchObject({ error: "unauthorized" });
    const lookup = await db.query<{ username: string }>("select username from public.player_profiles where id = $1", [a]);
    const profile = await rpc(db, "public_player", [lookup.rows[0]!.username]);
    expect(profile).toMatchObject({ profile: { rating: 1020, wins: 1, world_rank: 1 }, matches: [{ outcome: "win" }] });
    expect(JSON.stringify(profile)).not.toMatch(/email|password|secret|token/);
    await expect(asUser(db, a, "update public.player_ratings set rating = 9000 where player_id = $1", [a])).rejects.toThrow();
    expect(await rpc(db, "get_notifications", [a])).toMatchObject({ unread: 1, items: [{ kind: "rating" }] });
    expect(await rpc(db, "set_username", [a, "renamed_ranked"])).toMatchObject({ ok: true });
    expect(await rpc(db, "public_player", ["renamed_ranked"])).toMatchObject({ profile: { rating: 1020 } });
  });

  it("settles a rated checkmate via submit_move and a draw via agreement", async () => {
    const a = await player(); const b = await player();
    await rpc(db,"matchmake",[a,240000,0]);
    const { gameId } = await rpc<{ gameId: string }>(db,"matchmake",[b,240000,0]);
    const { rows } = await db.query<{ white_id: string; black_id: string }>(
      "select white_id,black_id from public.chess_games where id=$1",[gameId]);
    const { white_id: white, black_id: black } = rows[0]!;
    // The live balances are protected by RLS; seed a near-promotion snapshot for this test.
    await db.query("update public.chess_games set black_rating_before=1390 where id=$1",[gameId]);
    await db.query("update public.player_ratings set rating=1390,peak=1390 where player_id=$1",[black]);
    const chess = new Chess();
    for (const [version,san] of ["f3","e5","g4","Qh4#"].entries()) {
      const move = chess.move(san);
      expect(await rpc(db,"submit_move",[
        gameId,move.color === "w" ? white : black,version,randomUUID(),move.from,move.to,null,
        move.san,chess.fen(),chess.isCheckmate() ? "black" : null,chess.isCheckmate() ? "checkmate" : null,
      ])).toMatchObject({ ok:true });
    }
    expect(await rpc(db,"game_rating_result",[gameId,black])).toMatchObject({
      rating: { rating_before:1390,rating_after:1407,rank_before:"Silver",rank_after:"Gold" },
    });
    await rpc(db,"matchmake",[a,420000,0]);
    const draw = await rpc<{ gameId: string }>(db,"matchmake",[b,420000,0]);
    await rpc(db,"game_action",[draw.gameId,white,"offer_draw"]);
    await rpc(db,"game_action",[draw.gameId,black,"accept_draw"]);
    expect(await rpc(db,"game_rating_result",[draw.gameId,black])).toMatchObject({ rating:{ outcome:"draw",rating_change:0 } });
    expect(await rpc(db,"game_rating_result",[draw.gameId,white])).toMatchObject({ rating:{ outcome:"draw",rating_change:4 } });
  });

  it("breaks rating ties by wins then ID and filters friends independently", async () => {
    const a = await player(); const b = await player(); const c = await player();
    await db.query("update public.player_ratings set rating=5000,peak=5000,wins=1 where player_id in ($1,$2,$3)", [a,b,c]);
    await db.query("update public.player_ratings set wins=2 where player_id=$1", [c]);
    await friends(a,b);
    await rpc(db, "friend_action", [a,c,"request"]);
    const tieOrder = [a,b].sort();
    const world = await rpc<{ rows: { player_id: string }[] }>(db, "leaderboard", [null,"world",null,"",0]);
    expect(world.rows.slice(0,3).map(({ player_id }) => player_id)).toEqual([c,...tieOrder]);
    expect(await rpc(db,"leaderboard",[a,"friends",null,"",0])).toMatchObject({
      rows: [{ player_id: tieOrder[0],position:1 },{ player_id: tieOrder[1],position:2 }],
    });
  });

  it("excludes casual and short private games and caps repeated ranked private results", async () => {
    const host = await player(); const guest = await player();
    const playRoom = async (ranked: boolean, ply: number) => {
      const created = await room(host, ranked);
      expect(created.ranked).toBe(ranked);
      const game = await join(guest, created.code);
      await db.query("update public.chess_games set ply = $2 where id = $1", [game, ply]);
      await rpc(db, "game_action", [game, guest, "resign"]);
      return rpc(db, "game_rating_result", [game, host]);
    };
    expect(await playRoom(false, 12)).toMatchObject({ rating: null, exclusion: null });
    expect(await playRoom(true, 0)).toMatchObject({ rating: null, exclusion: "private_minimum_moves" });
    expect(await playRoom(true, 8)).toMatchObject({ rating: { rating_after: 1020 } });
    expect(await playRoom(true, 8)).toMatchObject({ rating: { rating_after: 1040 } });
    expect(await playRoom(true, 8)).toMatchObject({ rating: null, exclusion: "private_pair_limit" });
  });

  it("rates clock and disconnect finishes and clamps the rating floor", async () => {
    const a = await player(); const b = await player();
    await db.query("update public.player_ratings set rating=1 where player_id=$1", [a]);
    const match = async (clock: number) => {
      await rpc(db, "matchmake", [a, clock, 0]);
      return (await rpc<{gameId: string}>(db, "matchmake", [b, clock, 0])).gameId;
    };
    const flag = await match(60000);
    await db.query(`update public.chess_games set turn = case when white_id=$2 then 'w' else 'b' end,
      turn_started_at = now() - interval '90 seconds' where id=$1`, [flag, a]);
    await rpc(db, "get_game_state", [flag, b]);
    expect(await rpc(db, "game_rating_result", [flag, a])).toMatchObject({ rating: { rating_after: 0, rating_change: -1 } });

    const disconnect = await match(120000);
    const scene = randomUUID();
    await rpc(db, "update_game_scene", [disconnect, a, scene, false]);
    await db.query("update public.game_scene_connections set online_until = now() - interval '32 seconds' where scene_id=$1", [scene]);
    await rpc(db, "update_game_scene", [disconnect, b, randomUUID(), false]);
    expect(await rpc(db, "game_rating_result", [disconnect, b])).toMatchObject({ rating: { outcome: "win" } });
  });
});

describe("friendship, invitation and spectating", () => {
  it("deduplicates crossed requests, enforces direction and handles decline, cancel and removal", async () => {
    const a = await player(); const b = await player(); const c = await player();
    expect(await rpc(db, "friend_action", [a, a, "request"])).toMatchObject({ ok: false });
    expect(await rpc(db, "friend_action", [a, b, "request"])).toMatchObject({ status: "pending" });
    expect(await rpc(db, "friend_action", [b, a, "request"])).toMatchObject({ error: "friend_request_exists" });
    expect(await rpc(db, "friend_action", [a, b, "accept"])).toMatchObject({ ok: false });
    expect(await rpc(db, "friend_action", [b, a, "decline"])).toMatchObject({ status: "declined" });
    await rpc(db, "friend_action", [a, c, "request"]);
    expect(await rpc(db, "friend_action", [a, c, "cancel"])).toMatchObject({ status: "cancelled" });
    await friends(b, c);
    expect(await rpc(db, "friend_action", [b, c, "remove"])).toMatchObject({ status: "cancelled" });
    expect(await rpc(db, "get_friends", [b, "", 0])).toMatchObject({ people: [] });
    await expect(asUser(db, a, "select * from public.friendships")).rejects.toThrow();
  });

  it("limits Presence and verified activity to current friends who allow visibility", async () => {
    const a = await player(); const b = await player(); const stranger = await player();
    await friends(a,b);
    const state = await rpc<{ presenceTopic: string }>(db,"social_settings",[a,null]);
    const allows = async (viewer: string, topic: string) =>
      (await asUser<{ allowed: boolean }>(db,viewer,"select public.can_receive_social_topic($1) as allowed",[topic]))[0]?.allowed;
    expect(await allows(b,state.presenceTopic)).toBe(true);
    expect(await allows(stranger,state.presenceTopic)).toBe(false);
    const tab = randomUUID();
    await rpc(db,"update_player_activity",[a,tab,"computer"]);
    expect(await rpc(db,"friend_details",[b,a])).toMatchObject({ presence: { activity:"computer" } });
    await db.query("update public.player_activity set expires_at=now()-interval '1 second' where tab_id=$1",[tab]);
    expect(await rpc(db,"friend_details",[b,a])).toMatchObject({ presence: { activity:"offline" } });
    await rpc(db,"social_settings",[a,JSON.stringify({ show_activity:false,allow_friends:false,allow_ranked:false })]);
    expect(await rpc(db,"friend_details",[b,a])).toMatchObject({ presence: null });
    expect(await allows(b,state.presenceTopic)).toBe(false);
    const visible = await rpc<{ presenceTopic: string }>(db,"social_settings",[a,JSON.stringify({
      show_activity:true,allow_friends:false,allow_ranked:false,
    })]);
    expect(visible.presenceTopic).not.toBe(state.presenceTopic);
    await rpc(db,"friend_action",[a,b,"remove"]);
    expect(await allows(b,visible.presenceTopic)).toBe(false);
  });

  it("preserves room passwords for invitations and allows only scoped password-authorized viewers", async () => {
    const host = await player(); const guest = await player(); const viewer = await player(); const another = await player();
    await friends(host, guest); await friends(host, viewer);
    await prefs(host); await prefs(guest);
    const created = await room(host, true, true);
    expect(await rpc(db, "invite_friend", [host, guest, created.code])).toMatchObject({ ok: true });
    const inbox = await rpc<{ invites: { id: string }[] }>(db, "get_friends", [guest, "", 0]);
    expect(JSON.stringify(inbox)).not.toContain("roomsecret");
    const invite = inbox.invites[0]!.id;
    expect(await rpc(db, "reply_to_invite", [viewer, invite, "roomsecret", true])).toMatchObject({ ok: false });
    expect(await rpc(db, "reply_to_invite", [guest, invite, "incorrect", true])).toMatchObject({ error: "wrong_password" });
    const { gameId } = await rpc<{ gameId: string }>(db, "reply_to_invite", [guest, invite, "roomsecret", true]);
    expect(await rpc(db, "reply_to_invite", [guest, invite, "roomsecret", true])).toMatchObject({ ok: true, gameId });
    expect(await rpc(db, "authorize_spectator", [another, gameId, "roomsecret"])).toMatchObject({ error: "watch_unavailable" });
    expect(await rpc(db, "authorize_spectator", [viewer, gameId, null])).toMatchObject({ error: "spectator_password_required" });
    expect(await rpc(db, "authorize_spectator", [viewer, gameId, "incorrect"])).toMatchObject({ error: "wrong_password" });
    expect(await rpc(db, "authorize_spectator", [viewer, gameId, "roomsecret"])).toMatchObject({ ok: true });
    expect(await rpc(db, "get_spectator_state", [viewer, gameId])).toMatchObject({ kind: "online", viewers: 1, board: { sequence: 0, moves: [] } });
    expect(await rpc(db, "get_game_state", [gameId, viewer])).toMatchObject({ error: "not_found" });
    expect(await rpc(db, "game_action", [gameId, viewer, "resign"])).toMatchObject({ error: "not_participant" });
    const [topic] = await asUser<{ permitted: boolean }>(db, viewer, "select public.can_receive_social_topic($1) as permitted", [`watch:${gameId}`]);
    expect(topic?.permitted).toBe(true);
    await db.query("update public.spectator_authorizations set expires_at=now()-interval '1 second' where session_id=$1", [gameId]);
    expect(await rpc(db, "get_spectator_state", [viewer, gameId])).toMatchObject({ error: "watch_authorization_required" });
    await rpc(db, "authorize_spectator", [viewer, gameId, "roomsecret"]);
    await rpc(db, "set_room_spectators", [host, gameId, false]);
    expect(await rpc(db, "get_spectator_state", [viewer, gameId])).toMatchObject({ error: "watch_unavailable" });
  });

  it.each(["computer", "local"])("shares a %s board without awarding ratings and detects disconnection", async (kind) => {
    const host = await player(); const viewer = await player(); const second = await player();
    await friends(host, viewer); await friends(host, second); await prefs(host);
    const board = JSON.stringify({ white: "White", black: "Black", status: "active", moves: [] });
    const before = (await db.query("select count(*) from public.rating_transactions")).rows;
    const { sessionId } = await rpc<{ sessionId: string }>(db, "publish_spectator", [host, null, kind, 1, board]);
    for (const user of [viewer, second]) {
      expect(await rpc(db, "authorize_spectator", [user, sessionId, null])).toMatchObject({ ok: true });
    }
    await rpc(db, "publish_spectator", [host, sessionId, kind, 3, board]);
    await rpc(db, "publish_spectator", [host, sessionId, kind, 2, JSON.stringify({ white: "Stale" })]);
    expect(await rpc(db, "get_spectator_state", [viewer, sessionId])).toMatchObject({ kind, viewers: 2, board: { sequence: 3, white: "White" } });
    await db.query("update public.spectator_sessions set last_activity=now()-interval '30 seconds' where id=$1", [sessionId]);
    expect(await rpc(db, "get_spectator_state", [viewer, sessionId])).toMatchObject({ board: { disconnected: true } });
    expect((await db.query("select count(*) from public.rating_transactions")).rows).toEqual(before);
    await db.query("update public.spectator_sessions set last_activity=now()-interval '16 minutes' where id=$1", [sessionId]);
    await rpc(db, "cleanup_social", []);
    expect(await rpc(db, "get_spectator_state", [viewer, sessionId])).toMatchObject({ error: "watch_unavailable" });
  });
});

it("projects a local stream to the legal board, excluding private analysis and credentials", () => {
  const board = sanitizeBoard({
    sequence: 1, white: "White", black: "Black", fen: "untrusted", turn: "w",
    moves: [{ from: "e2", to: "e4", secretAnalysis: "private", predictedMove: "private" }],
    ownerSettings: { enabled: true }, accessToken: "private", stockfish: { depth: 20 },
  });
  expect(board).toMatchObject({ turn: "b", moves: [{ from: "e2", to: "e4", promotion: null }] });
  expect(board?.fen).not.toBe("untrusted");
  expect(JSON.stringify(board)).not.toMatch(/secretAnalysis|ownerSettings|accessToken|stockfish|predictedMove|private/);
  expect(sanitizeBoard({ sequence: 2, white: "White", black: "Black", moves: [{ from: "e2", to: "e5" }] })).toBeNull();
});
