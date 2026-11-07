import { callRpc, readBody, withPlayer } from "@/lib/multiplayer/http";
import { findOnlineTimeControl } from "@/lib/multiplayer/timeControls";

export function GET(request: Request) {
  return withPlayer(request, (_userId, admin) => callRpc(admin, "list_open_rooms", {}));
}

export function POST(request: Request) {
  return withPlayer(request, async (userId, admin) => {
    const { name, password, initialMs, incrementMs, color, discoverable } = await readBody(request);
    const preset = findOnlineTimeControl(initialMs, incrementMs);
    if (!preset) return { ok: false, error: "invalid_time_control" };
    if (typeof name !== "string") return { ok: false, error: "invalid_room_name" };
    if (typeof password !== "string") return { ok: false, error: "invalid_password" };
    return callRpc(admin, "create_room", {
      p_user: userId,
      p_name: name,
      p_password: password,
      p_initial: preset.control.initialMs,
      p_increment: preset.control.incrementMs,
      p_color: color,
      p_discoverable: discoverable !== false,
    });
  });
}
