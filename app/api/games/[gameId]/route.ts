import { callRpc, readBody, withPlayer } from "@/lib/multiplayer/http";

type Context = { params: Promise<{ gameId: string }> };

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

/** The canonical game: row, full move list and the database clock. */
export async function GET(request: Request, { params }: Context) {
  const { gameId } = await params;
  return withPlayer(request, async (userId, admin) => {
    if (!UUID.test(gameId)) return { ok: false, error: "not_found" };
    return callRpc(admin, "get_game_state", { p_game: gameId, p_user: userId });
  });
}

/** Record an authenticated player's heartbeat or departure from this game scene. */
export async function POST(request: Request, { params }: Context) {
  const { gameId } = await params;
  return withPlayer(request, async (userId, admin) => {
    const { sceneId, leaving } = await readBody(request);
    if (!UUID.test(gameId) || typeof sceneId !== "string" || !UUID.test(sceneId) || typeof leaving !== "boolean") {
      return { ok: false, error: "invalid_request" };
    }
    return callRpc(admin, "update_game_scene", {
      p_game: gameId,
      p_user: userId,
      p_scene: sceneId,
      p_leaving: leaving,
    });
  });
}
