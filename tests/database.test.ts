import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Chess } from "chess.js";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createDatabase, createUser, rpc } from "./db/harness";

interface Result {
  ok: boolean;
  error?: string;
  status?: string;
  gameId?: string;
  duplicate?: boolean;
  game?: GameRow;
  room?: { code: string; [key: string]: unknown };
  rooms?: Record<string, unknown>[];
}

interface GameRow {
  id: string;
  white_id: string;
  black_id: string;
  status: string;
  turn: string;
  version: number;
  ply: number;
  result: string | null;
  result_reason: string | null;
  draw_offered_by: string | null;
  rematch_game_id: string | null;
  white_ms: number;
  black_ms: number;
}

let db: PGlite;
const ONE_MIN = 60_000;

beforeAll(async () => {
  db = await createDatabase();
}, 60_000);

async function game(id: string): Promise<GameRow> {
  const { rows } = await db.query<GameRow>("select * from public.chess_games where id = $1", [id]);
  return rows[0]!;
}

/** Two fresh players in a game against each other, returned as [white, black]. */
async function startGame(initialMs = 5 * ONE_MIN, incrementMs = 0) {
  const a = await createUser(db);
  const b = await createUser(db);
  await rpc(db, "matchmake", [a, initialMs, incrementMs]);
  const matched = await rpc<Result>(db, "matchmake", [b, initialMs, incrementMs]);
  const row = await game(matched.gameId!);
  return { gameId: row.id, white: row.white_id, black: row.black_id };
}

/** Validates with chess.js exactly as the API route does, then commits. */
async function play(gameId: string, player: string, san: string, requestId = randomUUID()) {
  const { rows } = await db.query<{ from_sq: string; to_sq: string; promotion: string | null }>(
    "select from_sq, to_sq, promotion from public.chess_moves where game_id = $1 order by ply",
    [gameId],
  );
  const chess = new Chess();
  for (const move of rows) {
    chess.move({ from: move.from_sq, to: move.to_sq, promotion: move.promotion ?? undefined });
  }
  const move = chess.move(san);
  const row = await game(gameId);
  const result = chess.isCheckmate() ? (move.color === "w" ? "white" : "black") : null;
  return rpc<Result>(db, "submit_move", [
    gameId, player, row.version, requestId, move.from, move.to, move.promotion ?? null,
    move.san, chess.fen(), result, result ? "checkmate" : null,
  ]);
}

describe("matchmaking", () => {
  it("queues the first player and matches the second with distinct colours", async () => {
    const a = await createUser(db);
    const b = await createUser(db);

    const first = await rpc<Result>(db, "matchmake", [a, 3 * ONE_MIN, 2000]);
    expect(first).toMatchObject({ ok: true, status: "waiting" });

    const second = await rpc<Result>(db, "matchmake", [b, 3 * ONE_MIN, 2000]);
    expect(second).toMatchObject({ ok: true, status: "matched" });

    const row = await game(second.gameId!);
    expect(new Set([row.white_id, row.black_id])).toEqual(new Set([a, b]));
    expect(row).toMatchObject({ status: "active", turn: "w", white_ms: 180_000, black_ms: 180_000 });

    // The waiting player's next heartbeat reports the same game.
    const heartbeat = await rpc<Result>(db, "matchmake", [a, 3 * ONE_MIN, 2000]);
    expect(heartbeat).toMatchObject({ status: "matched", gameId: second.gameId });

    const { rows } = await db.query("select * from public.matchmaking_queue where player_id in ($1, $2)", [a, b]);
    expect(rows).toHaveLength(0);
  });

  it("notifies both players on their private topics", async () => {
    const { gameId, white, black } = await startGame();
    const { rows } = await db.query<{ topic: string }>(
      "select topic from realtime.sent where event = 'game_started' and payload->>'gameId' = $1",
      [gameId],
    );
    expect(rows.map((row) => row.topic).sort()).toEqual([`player:${white}`, `player:${black}`].sort());
  });

  it("never matches a player with themselves", async () => {
    const a = await createUser(db);
    await rpc(db, "matchmake", [a, 7 * ONE_MIN, 0]);
    const again = await rpc<Result>(db, "matchmake", [a, 7 * ONE_MIN, 0]);
    expect(again.status).toBe("waiting");
  });

  it("only matches compatible time controls", async () => {
    const a = await createUser(db);
    const b = await createUser(db);
    await rpc(db, "matchmake", [a, 11 * ONE_MIN, 0]);
    const other = await rpc<Result>(db, "matchmake", [b, 11 * ONE_MIN, 5000]);
    expect(other.status).toBe("waiting");
  });

  it("removes the entry on cancel so nobody can match it", async () => {
    const a = await createUser(db);
    const b = await createUser(db);
    await rpc(db, "matchmake", [a, 13 * ONE_MIN, 0]);
    expect(await rpc<Result>(db, "cancel_matchmaking", [a])).toMatchObject({ status: "idle" });
    expect((await rpc<Result>(db, "matchmake", [b, 13 * ONE_MIN, 0])).status).toBe("waiting");
  });

  it("ignores entries whose heartbeat has expired, and maintenance deletes them", async () => {
    const a = await createUser(db);
    const b = await createUser(db);
    await rpc(db, "matchmake", [a, 17 * ONE_MIN, 0]);
    await db.query("update public.matchmaking_queue set expires_at = now() - interval '1 second' where player_id = $1", [a]);
    expect((await rpc<Result>(db, "matchmake", [b, 17 * ONE_MIN, 0])).status).toBe("waiting");

    await rpc(db, "run_maintenance", []);
    const { rows } = await db.query("select 1 from public.matchmaking_queue where player_id = $1", [a]);
    expect(rows).toHaveLength(0);
  });

  it("does not start a second game for a player who is already playing", async () => {
    const { gameId, white } = await startGame(19 * ONE_MIN);
    const c = await createUser(db);
    await rpc(db, "matchmake", [c, 19 * ONE_MIN, 0]);
    const repeat = await rpc<Result>(db, "matchmake", [white, 19 * ONE_MIN, 0]);
    expect(repeat).toMatchObject({ status: "matched", gameId });
  });

  it("expires a search after 30 seconds without extending it on repeat requests", async () => {
    const player = await createUser(db);
    await rpc(db, "matchmake", [player, 29 * ONE_MIN, 0]);
    const expiry = async () => (await db.query<{ lifetime: number; expires_at: Date }>(
      "select round(extract(epoch from expires_at - created_at))::int as lifetime, expires_at from public.matchmaking_queue where player_id = $1",
      [player],
    )).rows[0]!;
    const first = await expiry();
    expect(first.lifetime).toBe(30);
    await rpc(db, "matchmake", [player, 29 * ONE_MIN, 0]);
    expect(await expiry()).toEqual(first);
  });

  it("rate limits repeated searches", async () => {
    const a = await createUser(db);
    let last: Result | undefined;
    for (let i = 0; i < 21; i++) last = await rpc<Result>(db, "matchmake", [a, 23 * ONE_MIN, 0]);
    expect(last).toMatchObject({ ok: false, error: "rate_limited" });
  });
});

describe("rooms", () => {
  async function createRoom(host: string, overrides: Partial<{ color: string; discoverable: boolean }> = {}) {
    const created = await rpc<Result>(db, "create_room", [
      host, "Friday blitz", "s3cret-pass", 5 * ONE_MIN, 3000, overrides.color ?? "w",
      overrides.discoverable ?? true,
    ]);
    expect(created.ok).toBe(true);
    return created.room!.code;
  }

  it("stores only a bcrypt hash of the password", async () => {
    const host = await createUser(db);
    const code = await createRoom(host);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const { rows } = await db.query<{ password_hash: string }>(
      "select password_hash from public.chess_rooms where code = $1",
      [code],
    );
    expect(rows[0]!.password_hash).toMatch(/^\$2a\$08\$/);
    expect(rows[0]!.password_hash).not.toContain("s3cret-pass");
  });

  it("joins with the right password and honours the host's colour", async () => {
    const host = await createUser(db);
    const guest = await createUser(db);
    const code = await createRoom(host, { color: "b" });

    const joined = await rpc<Result>(db, "join_room", [guest, code.toLowerCase(), "s3cret-pass"]);
    expect(joined.ok).toBe(true);
    const row = await game(joined.gameId!);
    expect(row).toMatchObject({ white_id: guest, black_id: host });

    // A repeated join by the same guest is idempotent.
    expect(await rpc<Result>(db, "join_room", [guest, code, "s3cret-pass"])).toMatchObject({
      gameId: joined.gameId,
    });
  });

  it("rejects wrong passwords, unknown codes, the host, and a third player", async () => {
    const host = await createUser(db);
    const guest = await createUser(db);
    const third = await createUser(db);
    const code = await createRoom(host);

    expect(await rpc<Result>(db, "join_room", [guest, code, "nope"])).toMatchObject({ error: "wrong_password" });
    expect(await rpc<Result>(db, "join_room", [guest, "ZZZZZZ", "x"])).toMatchObject({ error: "room_not_found" });
    expect(await rpc<Result>(db, "join_room", [guest, "bad code';--", "x"])).toMatchObject({ error: "invalid_room_code" });
    expect(await rpc<Result>(db, "join_room", [host, code, "s3cret-pass"])).toMatchObject({ error: "own_room" });

    expect((await rpc<Result>(db, "join_room", [guest, code, "s3cret-pass"])).ok).toBe(true);
    expect(await rpc<Result>(db, "join_room", [third, code, "s3cret-pass"])).toMatchObject({ error: "room_full" });

    const { rows } = await db.query("select 1 from public.chess_games where room_id = (select id from public.chess_rooms where code = $1)", [code]);
    expect(rows).toHaveLength(1);
  });

  it("limits password guessing", async () => {
    const host = await createUser(db);
    const guest = await createUser(db);
    const code = await createRoom(host);
    for (let i = 0; i < 10; i++) await rpc(db, "join_room", [guest, code, `guess-${i}`]);
    expect(await rpc<Result>(db, "join_room", [guest, code, "s3cret-pass"])).toMatchObject({ error: "rate_limited" });
  });

  it("closes cancelled and expired rooms to joiners and to the browser", async () => {
    const host = await createUser(db);
    const other = await createUser(db);
    const guest = await createUser(db);
    const cancelled = await createRoom(host);
    await rpc(db, "cancel_room", [host, cancelled]);
    expect(await rpc<Result>(db, "join_room", [guest, cancelled, "s3cret-pass"])).toMatchObject({ error: "room_closed" });

    const expired = await createRoom(other);
    await db.query("update public.chess_rooms set expires_at = now() - interval '1 second' where code = $1", [expired]);
    expect(await rpc<Result>(db, "join_room", [guest, expired, "s3cret-pass"])).toMatchObject({ error: "room_expired" });

    const listed = await rpc<Result>(db, "list_open_rooms", []);
    const codes = listed.rooms!.map((room) => room.code);
    expect(codes).not.toContain(cancelled);
    expect(codes).not.toContain(expired);
  });

  it("lists discoverable rooms with safe fields only", async () => {
    const host = await createUser(db);
    const hidden = await createUser(db);
    const code = await createRoom(host);
    const hiddenCode = await createRoom(hidden, { discoverable: false });

    const listed = await rpc<Result>(db, "list_open_rooms", []);
    const room = listed.rooms!.find((candidate) => candidate.code === code);
    expect(room).toMatchObject({ name: "Friday blitz", players: 1, initialMs: 300_000, incrementMs: 3000 });
    expect(listed.rooms!.map((candidate) => candidate.code)).not.toContain(hiddenCode);

    const serialized = JSON.stringify(listed);
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("$2a$");
  });

  it("never broadcasts a password hash", async () => {
    const { rows } = await db.query<{ payload: unknown }>("select payload from realtime.sent");
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain("$2a$");
    expect(JSON.stringify(rows)).not.toContain("password");
  });

  it("is invisible to browsers, which cannot read the table directly", async () => {
    const user = await createUser(db);
    await expect(asUser(db, user, "select * from public.chess_rooms")).rejects.toThrow(/permission denied/);
  });
});

describe("authoritative moves", () => {
  it("accepts a legal move from the side to move and advances the version", async () => {
    const { gameId, white } = await startGame();
    const result = await play(gameId, white, "e4");
    expect(result).toMatchObject({ ok: true, game: { turn: "b", version: 1, ply: 1 } });
  });

  it("rejects moves out of turn and from non-participants", async () => {
    const { gameId, black } = await startGame();
    const outsider = await createUser(db);
    expect(await play(gameId, black, "e4")).toMatchObject({ error: "not_your_turn" });
    expect(await play(gameId, outsider, "e4")).toMatchObject({ error: "not_participant" });
  });

  it("rejects a stale version and never stores a duplicate request twice", async () => {
    const { gameId, white, black } = await startGame();
    const requestId = randomUUID();
    await play(gameId, white, "d4", requestId);

    const replay = await rpc<Result>(db, "submit_move", [
      gameId, white, 0, requestId, "d2", "d4", null, "d4", "x", null, null,
    ]);
    expect(replay).toMatchObject({ ok: true, duplicate: true });

    const stale = await rpc<Result>(db, "submit_move", [
      gameId, black, 0, randomUUID(), "d7", "d5", null, "d5", "x", null, null,
    ]);
    expect(stale).toMatchObject({ error: "stale" });

    const { rows } = await db.query("select 1 from public.chess_moves where game_id = $1", [gameId]);
    expect(rows).toHaveLength(1);
  });

  it("records checkmate and frees both players", async () => {
    const { gameId, white, black } = await startGame();
    await play(gameId, white, "f3");
    await play(gameId, black, "e5");
    await play(gameId, white, "g4");
    const mate = await play(gameId, black, "Qh4#");
    expect(mate.game).toMatchObject({ status: "finished", result: "black", result_reason: "checkmate" });
    const late = await rpc<Result>(db, "submit_move", [
      gameId, white, mate.game!.version, randomUUID(), "a2", "a3", null, "a3", "x", null, null,
    ]);
    expect(late).toMatchObject({ error: "game_over" });

    const { rows } = await db.query<{ active_game_id: string | null }>(
      "select active_game_id from public.player_profiles where id in ($1, $2)",
      [white, black],
    );
    expect(rows.every((row) => row.active_game_id === null)).toBe(true);
  });

  it("deducts elapsed server time and adds the increment", async () => {
    const { gameId, white } = await startGame(5 * ONE_MIN, 2000);
    await db.query("update public.chess_games set turn_started_at = now() - interval '10 seconds' where id = $1", [gameId]);
    const result = await play(gameId, white, "e4");
    expect(result.game!.white_ms).toBeGreaterThanOrEqual(300_000 - 10_000 + 2000 - 100);
    expect(result.game!.white_ms).toBeLessThanOrEqual(300_000 - 10_000 + 2000);
  });

  it("settles a flag fall instead of accepting a late move", async () => {
    const { gameId, white } = await startGame(ONE_MIN);
    await db.query("update public.chess_games set turn_started_at = now() - interval '61 seconds' where id = $1", [gameId]);
    expect(await play(gameId, white, "e4")).toMatchObject({ error: "flagged" });
    expect(await game(gameId)).toMatchObject({ status: "finished", result: "black", result_reason: "timeout", white_ms: 0 });
  });

  it("draws a flag fall when the opponent cannot mate", async () => {
    const { gameId } = await startGame(ONE_MIN);
    await db.query(
      "update public.chess_games set fen = '8/8/8/4k3/8/8/3NK3/8 w - - 0 1', turn_started_at = now() - interval '2 minutes' where id = $1",
      [gameId],
    );
    await rpc(db, "run_maintenance", []);
    expect(await game(gameId)).toMatchObject({ result: "draw", result_reason: "timeout-insufficient-material" });
  });

  it("only lets players resign for themselves", async () => {
    const { gameId, black } = await startGame();
    const outsider = await createUser(db);
    expect(await rpc<Result>(db, "game_action", [gameId, outsider, "resign"])).toMatchObject({ error: "not_participant" });
    const resigned = await rpc<Result>(db, "game_action", [gameId, black, "resign"]);
    expect(resigned.game).toMatchObject({ result: "white", result_reason: "resignation" });
  });

  it("handles draw offers: only the opponent answers, and crossing offers agree", async () => {
    const { gameId, white, black } = await startGame();
    await rpc(db, "game_action", [gameId, white, "offer_draw"]);
    expect(await rpc<Result>(db, "game_action", [gameId, white, "offer_draw"])).toMatchObject({ error: "already_offered" });
    expect(await rpc<Result>(db, "game_action", [gameId, white, "accept_draw"])).toMatchObject({ error: "no_offer" });

    await rpc(db, "game_action", [gameId, black, "decline_draw"]);
    expect((await game(gameId)).draw_offered_by).toBeNull();

    await rpc(db, "game_action", [gameId, black, "offer_draw"]);
    const crossed = await rpc<Result>(db, "game_action", [gameId, white, "offer_draw"]);
    expect(crossed.game).toMatchObject({ result: "draw", result_reason: "agreement" });
  });

  it("starts a rematch with swapped colours only once both players ask", async () => {
    const { gameId, white, black } = await startGame();
    await rpc(db, "game_action", [gameId, white, "resign"]);

    await rpc(db, "game_action", [gameId, white, "request_rematch"]);
    expect((await game(gameId)).rematch_game_id).toBeNull();

    const accepted = await rpc<Result>(db, "game_action", [gameId, black, "request_rematch"]);
    const rematch = await game(accepted.game!.rematch_game_id!);
    expect(rematch).toMatchObject({ white_id: black, black_id: white, status: "active" });
  });
});

describe("row level security", () => {
  it("lets participants read their game and hides it from everyone else", async () => {
    const { gameId, white } = await startGame();
    const outsider = await createUser(db);
    expect(await asUser(db, white, "select id from public.chess_games where id = $1", [gameId])).toHaveLength(1);
    expect(await asUser(db, outsider, "select id from public.chess_games where id = $1", [gameId])).toHaveLength(0);
    expect(await asUser(db, null, "select id from public.chess_games where id = $1", [gameId])).toHaveLength(0);
  });

  it("refuses direct writes to game state, moves and profiles", async () => {
    const { gameId, white } = await startGame();
    await expect(
      asUser(db, white, "update public.chess_games set result = 'white' where id = $1", [gameId]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, white, "insert into public.chess_moves (game_id, ply, player_id, from_sq, to_sq, san, fen_after, clock_ms, request_id) values ($1, 1, $2, 'e2', 'e4', 'e4', 'x', 1, gen_random_uuid())", [gameId, white]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, white, "update public.player_profiles set active_game_id = null where id = $1", [white]),
    ).rejects.toThrow(/permission denied/);
  });

  it("does not let browsers call the mutation functions", async () => {
    const { gameId, white } = await startGame();
    await expect(
      asUser(db, white, "select public.submit_move($1, $2, 0, gen_random_uuid(), 'e2', 'e4', null, 'e4', 'x', null, null)", [gameId, white]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, white, "select public.game_action($1, $2, 'resign')", [gameId, white]),
    ).rejects.toThrow(/permission denied/);
  });

  it("authorises Realtime topics per participant", async () => {
    const { gameId, white } = await startGame();
    const outsider = await createUser(db);
    const check = (user: string, topic: string) =>
      asUser<{ ok: boolean }>(db, user, "select public.can_access_topic($1) as ok", [topic]);

    expect((await check(white, `game:${gameId}`))[0]!.ok).toBe(true);
    expect((await check(outsider, `game:${gameId}`))[0]!.ok).toBe(false);
    expect((await check(outsider, `player:${white}`))[0]!.ok).toBe(false);
    expect((await check(outsider, "game:not-a-uuid"))[0]!.ok).toBe(false);
    expect((await check(outsider, "rooms"))[0]!.ok).toBe(true);

    const insert = (user: string, extension: string) =>
      asUser(db, user, "insert into realtime.messages (topic, extension) values ($1, $2)", [`game:${gameId}`, extension], `game:${gameId}`);
    await expect(insert(white, "presence")).resolves.toBeDefined();
    await expect(insert(white, "broadcast")).rejects.toThrow(/row-level security/);
    await expect(insert(outsider, "presence")).rejects.toThrow(/row-level security/);
  });
});

describe("contact messages", () => {
  it("stores a valid message, rejects bad input and rate limits per client", async () => {
    const key = randomUUID();
    const send = (name: string, email: string, message: string) => rpc<Result>(db, "submit_contact", [name, email, message, key]);

    expect(await send("Ada", "ada@example.com", "Love the beginner mode!")).toEqual({ ok: true });
    expect((await send("", "ada@example.com", "Long enough message")).error).toBe("invalid_contact_name");
    expect((await send("Ada", "not-an-email", "Long enough message")).error).toBe("invalid_email");
    expect((await send("Ada", "ada@example.com", "short")).error).toBe("invalid_contact_message");
    expect(await send("Ada", "ada@example.com", "Fifth try still fits the window")).toEqual({ ok: true });
    expect((await send("Ada", "ada@example.com", "Sixth try is one too many")).error).toBe("rate_limited");

    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from public.contact_messages");
    expect(rows[0]!.n).toBe(2);
    await expect(asUser(db, randomUUID(), "select * from public.contact_messages", [])).rejects.toThrow(/permission denied/);
  });
});

describe("game scene reconnect grace", () => {
  it("freezes the position and clock, and resumes from the same position", async () => {
    const { gameId, white, black } = await startGame();
    const whiteScene = randomUUID();
    const blackScene = randomUUID();
    await rpc(db, "update_game_scene", [gameId, white, whiteScene, false]);
    await rpc(db, "update_game_scene", [gameId, black, blackScene, false]);
    expect(await play(gameId, white, "e4")).toMatchObject({ ok: true });
    const left = await rpc(db, "update_game_scene", [gameId, black, blackScene, true]);
    expect(left.game).toMatchObject({ status: "active", ply: 1, turn: "b", paused_at: expect.any(String) });
    expect(await play(gameId, black, "e5")).toMatchObject({ ok: false, error: "game_paused" });
    // A heartbeat already in flight when the player left cannot reopen the old scene.
    const stale = await rpc(db, "update_game_scene", [gameId, black, blackScene, false]);
    expect(stale.game).toMatchObject({ paused_at: expect.any(String) });
    const back = await rpc(db, "update_game_scene", [gameId, black, randomUUID(), false]);
    expect(back.game).toMatchObject({ status: "active", ply: 1, paused_at: null });
    expect(await play(gameId, black, "e5")).toMatchObject({ ok: true, game: { ply: 2 } });
  });

  it("detects an expired heartbeat and awards the opponent a win after the grace period", async () => {
    const { gameId, white, black } = await startGame();
    const whiteScene = randomUUID();
    const blackScene = randomUUID();
    await rpc(db, "update_game_scene", [gameId, white, whiteScene, false]);
    await rpc(db, "update_game_scene", [gameId, black, blackScene, false]);
    await db.query(
      "update public.game_scene_connections set online_until = now() - interval '1 second' where scene_id = $1",
      [whiteScene],
    );
    const paused = await rpc(db, "update_game_scene", [gameId, black, blackScene, false]);
    expect(paused.game).toMatchObject({ status: "active", white_reconnect_by: expect.any(String), black_reconnect_by: null });
    await db.query(
      "update public.game_scene_connections set online_until = now() - interval '31 seconds' where scene_id = $1",
      [whiteScene],
    );
    const late = await rpc(db, "update_game_scene", [gameId, white, randomUUID(), false]);
    expect(late.game).toMatchObject({ status: "finished", result: "black", result_reason: "disconnect" });
    expect(await rpc(db, "get_profile", [black])).toMatchObject({ profile: { activeGameId: null } });
    expect(await rpc(db, "get_profile", [white])).toMatchObject({ profile: { activeGameId: null } });
  });

  it("keeps a private room match active while the player has another open game tab", async () => {
    const host = await createUser(db);
    const guest = await createUser(db);
    const room = await rpc<Result>(db, "create_room", [host, "Reconnect room", "secret123", 5 * ONE_MIN, 0, "w", false]);
    const joined = await rpc<Result>(db, "join_room", [guest, room.room!.code, "secret123"]);
    const gameId = joined.gameId!;
    const hostScene = randomUUID();
    await rpc(db, "update_game_scene", [gameId, host, hostScene, false]);
    await rpc(db, "update_game_scene", [gameId, host, randomUUID(), false]);
    await rpc(db, "update_game_scene", [gameId, guest, randomUUID(), false]);
    const left = await rpc(db, "update_game_scene", [gameId, host, hostScene, true]);
    expect(left.game).toMatchObject({ paused_at: null });
    expect(await play(gameId, host, "e4")).toMatchObject({ ok: true });
  });

  it("settles a forfeit during maintenance when both game tabs have closed", async () => {
    const { gameId, white, black } = await startGame();
    await rpc(db, "update_game_scene", [gameId, white, randomUUID(), false]);
    await rpc(db, "update_game_scene", [gameId, black, randomUUID(), false]);
    await db.query(
      "update public.chess_games set presence_started_at = now() - interval '50 seconds' where id = $1",
      [gameId],
    );
    await db.query(
      "update public.game_scene_connections set online_until = now() - case when player_id = $2 then interval '35 seconds' else interval '15 seconds' end where game_id = $1",
      [gameId, black],
    );
    await rpc(db, "run_maintenance", []);
    expect(await game(gameId)).toMatchObject({ status: "finished", result: "white", result_reason: "disconnect" });
  });
});
