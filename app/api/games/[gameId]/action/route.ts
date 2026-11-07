import { callRpc, readBody, withPlayer } from "@/lib/multiplayer/http";
import { GAME_ACTIONS, type GameAction } from "@/lib/multiplayer/types";

type Context = { params: Promise<{ gameId: string }> };

const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(request: Request, { params }: Context) {
  const { gameId } = await params;
  return withPlayer(request, async (userId, admin) => {
    const { action } = await readBody(request);
    if (!UUID.test(gameId)) return { ok: false, error: "not_found" };
    if (!GAME_ACTIONS.includes(action as GameAction)) return { ok: false, error: "invalid_action" };
    return callRpc(admin, "game_action", { p_game: gameId, p_user: userId, p_action: action });
  });
}
