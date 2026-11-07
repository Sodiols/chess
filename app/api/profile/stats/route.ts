import { callRpc, withPlayer } from "@/lib/multiplayer/http";

export function GET(request: Request) {
  return withPlayer(request, (userId, admin) => callRpc(admin, "get_player_stats", { p_user: userId }));
}
