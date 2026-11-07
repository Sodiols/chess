import { callRpc, readBody, withPlayer } from "@/lib/multiplayer/http";

// Legacy guests may read their profile and claim a username: both are steps
// of upgrading a guest to a permanent account.
export function GET(request: Request) {
  return withPlayer(request, (userId, admin) => callRpc(admin, "get_profile", { p_user: userId }), {
    allowAnonymous: true,
  });
}

/** `{ username }`: claim or change the username. */
export function POST(request: Request) {
  return withPlayer(
    request,
    async (userId, admin) => {
      const { username } = await readBody(request);
      if (typeof username !== "string") return { ok: false, error: "invalid_username" };
      return callRpc(admin, "set_username", { p_user: userId, p_username: username });
    },
    { allowAnonymous: true },
  );
}
