import { callRpc, readBody, withPlayer } from "@/lib/multiplayer/http";

export function GET(request: Request) {
  return withPlayer(request, (userId, admin) => callRpc(admin, "get_profile", { p_user: userId }));
}

export function POST(request: Request) {
  return withPlayer(request, async (userId, admin) => {
    const { nickname } = await readBody(request);
    if (typeof nickname !== "string") return { ok: false, error: "invalid_nickname" };
    return callRpc(admin, "set_nickname", { p_user: userId, p_nickname: nickname });
  });
}
