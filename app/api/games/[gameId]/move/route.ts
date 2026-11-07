import { callRpc, readBody, withPlayer } from "@/lib/multiplayer/http";
import type { GameSnapshot } from "@/lib/multiplayer/types";
import { parseMoveInput, validateMove } from "@/lib/multiplayer/validateMove";

type Context = { params: Promise<{ gameId: string }> };

const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(request: Request, { params }: Context) {
  const { gameId } = await params;
  return withPlayer(request, async (userId, admin) => {
    if (!UUID.test(gameId)) return { ok: false, error: "not_found" };
    const input = parseMoveInput(await readBody(request));
    if (!input.ok) return input;

    const state = await callRpc(admin, "get_game_state", { p_game: gameId, p_user: userId });
    if (!state.ok) return state;
    const { game, moves } = state as unknown as GameSnapshot;

    // A retried request whose first attempt landed gets the same answer back.
    const landed = moves.find((move) => move.request_id === input.value.requestId);
    if (landed) return { ok: true, duplicate: true, game, move: landed };

    const checked = validateMove(game, moves, userId, input.value);
    if (!checked.ok) return checked;
    return callRpc(admin, "submit_move", { ...checked.value });
  });
}
