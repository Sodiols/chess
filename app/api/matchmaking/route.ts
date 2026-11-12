import { callRpc, readBody, withPlayer } from "@/lib/multiplayer/http";
import { findOnlineTimeControl } from "@/lib/multiplayer/timeControls";

/** Enter the queue for up to 30 seconds. */
export function POST(request: Request) {
  return withPlayer(request, async (userId, admin) => {
    const { initialMs, incrementMs } = await readBody(request);
    const preset = findOnlineTimeControl(initialMs, incrementMs);
    if (!preset) return { ok: false, error: "invalid_time_control" };
    return callRpc(admin, "matchmake", {
      p_user: userId,
      p_initial: preset.control.initialMs,
      p_increment: preset.control.incrementMs,
    });
  });
}

export function DELETE(request: Request) {
  return withPlayer(request, (userId, admin) => callRpc(admin, "cancel_matchmaking", { p_user: userId }));
}
