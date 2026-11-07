import { callRpc, readBody, withPlayer } from "@/lib/multiplayer/http";
import { sanitizeSecretSettings } from "@/lib/secret/settings";

/** `{ owner: false }` for everyone but the verified owner, who also gets their settings. */
export function GET(request: Request) {
  return withPlayer(request, (userId, admin) => callRpc(admin, "get_owner_settings", { p_user: userId }));
}

/** `{ settings }`: saves the owner's Secret Mode preferences. The database refuses anyone else. */
export function POST(request: Request) {
  return withPlayer(request, async (userId, admin) => {
    const { settings } = await readBody(request);
    return callRpc(admin, "set_owner_settings", { p_user: userId, p_settings: sanitizeSecretSettings(settings) });
  });
}
