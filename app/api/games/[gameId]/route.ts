import { callRpc, withPlayer } from "@/lib/multiplayer/http";

type Context = { params: Promise<{ gameId: string }> };

const UUID = /^[0-9a-f-]{36}$/i;

/** The canonical game: row, full move list and the database clock. */
export async function GET(request: Request, { params }: Context) {
  const { gameId } = await params;
  return withPlayer(request, async (userId, admin) => {
    if (!UUID.test(gameId)) return { ok: false, error: "not_found" };
    return callRpc(admin, "get_game_state", { p_game: gameId, p_user: userId });
  });
}
