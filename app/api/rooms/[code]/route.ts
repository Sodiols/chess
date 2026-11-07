import { callRpc, readBody, withPlayer } from "@/lib/multiplayer/http";

type Context = { params: Promise<{ code: string }> };

/** `{ action: "join", password }` or `{ action: "heartbeat" }` (host only). */
export async function POST(request: Request, { params }: Context) {
  const { code } = await params;
  return withPlayer(request, async (userId, admin) => {
    const { action, password } = await readBody(request);
    if (action === "heartbeat") return callRpc(admin, "room_heartbeat", { p_user: userId, p_code: code });
    if (action !== "join") return { ok: false, error: "invalid_action" };
    return callRpc(admin, "join_room", {
      p_user: userId,
      p_code: code,
      p_password: typeof password === "string" ? password : "",
    });
  });
}

export async function DELETE(request: Request, { params }: Context) {
  const { code } = await params;
  return withPlayer(request, (userId, admin) => callRpc(admin, "cancel_room", { p_user: userId, p_code: code }));
}
