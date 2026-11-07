import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createDatabase, createUser, rpc } from "./db/harness";

interface Result {
  ok: boolean;
  error?: string;
  available?: boolean;
  reason?: string;
  gameId?: string;
  profile?: { id: string; username: string | null; nickname: string; activeGameId: string | null };
  room?: { code: string; status: string; gameId: string | null } | null;
  stats?: { played: number; wins: number; losses: number; draws: number };
  recent?: { outcome: string; opponentName: string; color: string }[];
}

let db: PGlite;
beforeAll(async () => {
  db = await createDatabase();
}, 60_000);

const profile = async (id: string) => (await rpc<Result>(db, "get_profile", [id])).profile!;

async function signUpError(username: string): Promise<string | null> {
  try {
    await createUser(db, { username });
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

describe("sign-up creates the profile", () => {
  it("stores the chosen username, also used as the display name", async () => {
    const id = await createUser(db, { username: "sodiol" });
    expect(await profile(id)).toMatchObject({ username: "sodiol", nickname: "sodiol", activeGameId: null });
  });

  it("refuses a username that differs only in case, failing the whole sign-up", async () => {
    await createUser(db, { username: "ChessMaster99" });
    expect(await signUpError("chessmaster99")).toBe("username_taken");
    const { rows } = await db.query("select 1 from public.player_profiles where lower(username) = 'chessmaster99'");
    expect(rows).toHaveLength(1);
  });

  it("refuses invalid and reserved usernames", async () => {
    expect(await signUpError("ab")).toBe("invalid_username");
    expect(await signUpError("has space")).toBe("invalid_username");
    expect(await signUpError("Admin")).toBe("invalid_username");
  });

  it("gives accounts without a username a profile to finish later", async () => {
    const id = await createUser(db);
    expect((await profile(id)).username).toBeNull();
  });

  it("never lets the database hold an invalid or duplicate username, even written directly", async () => {
    const id = await createUser(db);
    await expect(db.query("update public.player_profiles set username = 'x y' where id = $1", [id])).rejects.toThrow();
    await expect(db.query("update public.player_profiles set username = 'SODIOL' where id = $1", [id])).rejects.toThrow();
  });
});

describe("usernames", () => {
  it("reports availability case-insensitively", async () => {
    await createUser(db, { username: "gambit_player" });
    expect(await rpc<Result>(db, "username_available", ["GAMBIT_PLAYER", "ip"])).toMatchObject({
      available: false,
      reason: "username_taken",
    });
    expect(await rpc<Result>(db, "username_available", ["fresh_name", "ip"])).toMatchObject({ available: true });
    expect(await rpc<Result>(db, "username_available", ["root", "ip"])).toMatchObject({ reason: "username_reserved" });
    expect(await rpc<Result>(db, "username_available", ["no!", "ip"])).toMatchObject({ reason: "invalid_username" });
  });

  it("claims, changes and protects usernames", async () => {
    const a = await createUser(db);
    const b = await createUser(db);
    expect((await rpc<Result>(db, "set_username", [a, "first_claim"])).profile?.username).toBe("first_claim");
    expect(await rpc<Result>(db, "set_username", [b, "FIRST_CLAIM"])).toEqual({ ok: false, error: "username_taken" });
    // Changing only the case of your own name is fine.
    expect((await rpc<Result>(db, "set_username", [a, "First_Claim"])).profile?.username).toBe("First_Claim");
    expect(await rpc<Result>(db, "set_username", [b, "support"])).toEqual({ ok: false, error: "username_reserved" });
  });

  it("keeps the names stored on games already played", async () => {
    const a = await createUser(db, { username: "before_a" });
    const b = await createUser(db, { username: "before_b" });
    await rpc(db, "matchmake", [a, 300_000, 0]);
    const { gameId } = await rpc<Result>(db, "matchmake", [b, 300_000, 0]);
    await rpc(db, "set_username", [a, "after_a"]);
    const { rows } = await db.query<{ names: string[] }>(
      "select array[white_name, black_name] as names from public.chess_games where id = $1",
      [gameId],
    );
    expect(rows[0]!.names.sort()).toEqual(["before_a", "before_b"]);
  });

  it("is not callable from the browser", async () => {
    const id = await createUser(db);
    await expect(asUser(db, id, "select public.set_username($1, 'sneaky')", [id])).rejects.toThrow(/permission/);
    await expect(asUser(db, id, "select public.username_available('x', 'y')")).rejects.toThrow(/permission/);
  });
});

describe("stale active games", () => {
  async function flaggedGame() {
    const a = await createUser(db);
    const b = await createUser(db);
    await rpc(db, "matchmake", [a, 60_000, 0]);
    const { gameId } = await rpc<Result>(db, "matchmake", [b, 60_000, 0]);
    // White's minute ran out long ago and nobody opened the game since.
    await db.query("update public.chess_games set turn_started_at = now() - interval '10 minutes' where id = $1", [gameId]);
    return { a, b, gameId: gameId! };
  }

  it("settles an abandoned, flagged game instead of blocking new ones", async () => {
    const { a, gameId } = await flaggedGame();
    const created = await rpc<Result>(db, "create_room", [a, "Room", "pass1234", 300_000, 0, "random", true]);
    expect(created.ok).toBe(true);
    const { rows } = await db.query<{ status: string; result_reason: string }>(
      "select status, result_reason from public.chess_games where id = $1",
      [gameId],
    );
    expect(rows[0]).toEqual({ status: "finished", result_reason: "timeout" });
  });

  it("reports a released game in the profile", async () => {
    const { b } = await flaggedGame();
    expect((await profile(b)).activeGameId).toBeNull();
  });

  it("still blocks a player whose game is genuinely running", async () => {
    const a = await createUser(db);
    const b = await createUser(db);
    await rpc(db, "matchmake", [a, 600_000, 0]);
    const { gameId } = await rpc<Result>(db, "matchmake", [b, 600_000, 0]);
    expect((await profile(a)).activeGameId).toBe(gameId);
    expect(await rpc<Result>(db, "create_room", [a, "Room", "pass1234", 300_000, 0, "random", true])).toEqual({
      ok: false,
      error: "in_game",
    });
  });
});

describe("rooms after a refresh", () => {
  it("returns the host's open room, without its password", async () => {
    const host = await createUser(db);
    expect((await rpc<Result>(db, "get_hosted_room", [host])).room).toBeNull();
    const { room } = await rpc<Result>(db, "create_room", [host, "Mine", "secret1", 300_000, 0, "w", false]);
    const hosted = await rpc<Result>(db, "get_hosted_room", [host]);
    expect(hosted.room?.code).toBe(room!.code);
    expect(JSON.stringify(hosted)).not.toMatch(/secret1|password|\$2a\$/);
  });

  it("cancels only a waiting room, and reports a started one", async () => {
    const host = await createUser(db);
    const guest = await createUser(db);
    const first = await rpc<Result>(db, "create_room", [host, "R", "pw1234", 300_000, 0, "random", true]);
    expect((await rpc<Result>(db, "cancel_room", [host, first.room!.code])).room?.status).toBe("cancelled");

    const second = await rpc<Result>(db, "create_room", [host, "R", "pw1234", 300_000, 0, "random", true]);
    const joined = await rpc<Result>(db, "join_room", [guest, second.room!.code, "pw1234"]);
    const cancel = await rpc<Result>(db, "cancel_room", [host, second.room!.code]);
    expect(cancel.room).toMatchObject({ status: "started", gameId: joined.gameId });
    expect(await rpc<Result>(db, "cancel_room", [guest, second.room!.code])).toEqual({
      ok: false,
      error: "room_not_found",
    });
  });

  it("marks a lapsed room expired on the next heartbeat and says so to joiners", async () => {
    const host = await createUser(db);
    const guest = await createUser(db);
    const { room } = await rpc<Result>(db, "create_room", [host, "R", "pw1234", 300_000, 0, "random", true]);
    await db.query("update public.chess_rooms set expires_at = now() - interval '1 second' where code = $1", [room!.code]);
    expect(await rpc<Result>(db, "join_room", [guest, room!.code, "pw1234"])).toEqual({ ok: false, error: "room_expired" });
    expect((await rpc<Result>(db, "room_heartbeat", [host, room!.code])).room?.status).toBe("expired");
  });

  it("tells a malformed code apart from a missing room", async () => {
    const guest = await createUser(db);
    expect(await rpc<Result>(db, "join_room", [guest, "abc", "x"])).toEqual({ ok: false, error: "invalid_room_code" });
    expect(await rpc<Result>(db, "join_room", [guest, "ZZZZZZ", "x"])).toEqual({ ok: false, error: "room_not_found" });
  });
});

describe("player statistics", () => {
  it("counts only finished games, from each player's side", async () => {
    const a = await createUser(db, { username: "stats_a" });
    const b = await createUser(db, { username: "stats_b" });
    expect((await rpc<Result>(db, "get_player_stats", [a])).stats).toEqual({ played: 0, wins: 0, losses: 0, draws: 0 });

    await rpc(db, "matchmake", [a, 300_000, 0]);
    const { gameId } = await rpc<Result>(db, "matchmake", [b, 300_000, 0]);
    expect((await rpc<Result>(db, "get_player_stats", [a])).stats?.played).toBe(0);

    await rpc(db, "game_action", [gameId, a, "resign"]);
    const forA = await rpc<Result>(db, "get_player_stats", [a]);
    const forB = await rpc<Result>(db, "get_player_stats", [b]);
    expect(forA.stats).toEqual({ played: 1, wins: 0, losses: 1, draws: 0 });
    expect(forB.stats).toEqual({ played: 1, wins: 1, losses: 0, draws: 0 });
    expect(forA.recent![0]).toMatchObject({ outcome: "loss", opponentName: "stats_b" });
  });
});
