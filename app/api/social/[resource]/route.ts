import { sanitizeBoard } from "@/lib/social/snapshot";
import { callRpc, readBody, respond, withPlayer } from "@/lib/multiplayer/http";
import { getAdminClient, getCaller } from "@/lib/supabase/server";

type Context = { params: Promise<{ resource: string }> };
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const uuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const invalid = { ok: false, error: "invalid_request" } as const;

export async function GET(request: Request, { params }: Context) {
  const { resource } = await params;
  const query = new URL(request.url).searchParams;
  const id = query.get("id");
  const search = (query.get("search") ?? "").slice(0, 20);
  const offset = Number(query.get("offset") ?? 0);
  if (!Number.isInteger(offset) || offset < 0 || offset > 100_000) return respond(invalid);

  if (resource === "leaderboard" || resource === "profile") {
    const admin = getAdminClient();
    if (!admin) return respond({ ok: false, error: "not_configured" });
    try {
      if (resource === "profile") {
        const username = query.get("username") ?? "";
        if (!/^[a-z0-9_]{3,20}$/i.test(username)) return respond({ ok: false, error: "not_found" });
        return respond(await callRpc(admin, "public_player", { p_username: username }) ?? { ok: false, error: "not_found" });
      }
      const viewer = await getCaller(request, admin);
      return respond(await callRpc(admin, "leaderboard", {
        p_user: viewer && !viewer.anonymous ? viewer.id : null,
        p_scope: query.get("scope") ?? "world", p_country: query.get("country"), p_search: search, p_offset: offset,
      }));
    } catch {
      return respond({ ok: false, error: "try_again" });
    }
  }

  return withPlayer(request, async (user, admin) => {
    switch (resource) {
      case "friends":
        return callRpc(admin, "get_friends", { p_user: user, p_search: search, p_offset: offset });
      case "friend":
        return uuid(id) ? callRpc(admin, "friend_details", { p_user: user, p_other: id }) : invalid;
      case "notifications":
        return callRpc(admin, "get_notifications", { p_user: user });
      case "settings":
        return callRpc(admin, "social_settings", { p_user: user, p_settings: null });
      case "spectate": {
        if (query.get("live") === "1") {
          return callRpc(admin, "list_live_spectator_games", { p_user: user, p_offset: offset });
        }
        const roomGame = query.get("roomGame");
        if (uuid(roomGame)) {
          const { data, error } = await admin.from("chess_rooms").select("allow_spectators").eq("host_id",user).eq("game_id",roomGame).maybeSingle();
          return error ? { ok: false, error: "try_again" } : { ok: true, enabled: data?.allow_spectators ?? null };
        }
        return uuid(id) ? callRpc(admin, "get_spectator_state", { p_user: user, p_session: id }) : invalid;
      }
      case "rating": {
        if (uuid(id)) return (await callRpc(admin, "game_rating_result", { p_user: user, p_game: id })) ?? { ok: false, error: "not_found" };
        if (id !== null) return invalid;
        const { data, error } = await admin.from("rating_transactions")
          .select("game_id,rating_before,rating_change,rating_after,rank_before,rank_after,outcome,created_at")
          .eq("player_id",user).order("created_at",{ ascending: false }).range(offset,offset + 24);
        return error ? { ok: false, error: "try_again" } : { ok: true, history: data };
      }
      case "room":
        return callRpc(admin, "room_preview", { p_user: user, p_code: (query.get("code") ?? "").slice(0, 6) });
      default:
        return { ok: false, error: "not_found" };
    }
  });
}

export async function POST(request: Request, { params }: Context) {
  const { resource } = await params;
  return withPlayer(request, async (user, admin) => {
    const body = await readBody(request);
    const { id, action, password } = body;
    if (password !== undefined && (typeof password !== "string" || password.length > 64)) return invalid;
    switch (resource) {
      case "friend":
        return uuid(id) && typeof action === "string"
          ? callRpc(admin, "friend_action", { p_user: user, p_other: id, p_action: action })
          : invalid;
      case "country":
        return typeof body.country === "string" && /^[A-Z]{2}$/.test(body.country)
          ? callRpc(admin, "set_country", { p_user: user, p_country: body.country })
          : invalid;
      case "settings": {
        const { show_activity, allow_friends, allow_ranked } = body;
        if ([show_activity, allow_friends, allow_ranked].some((value) => typeof value !== "boolean")) return invalid;
        return callRpc(admin, "social_settings", { p_user: user, p_settings: { show_activity, allow_friends, allow_ranked } });
      }
      case "notifications":
        return typeof id === "number" && Number.isSafeInteger(id) && id >= 0
          ? callRpc(admin, "get_notifications", { p_user: user, p_read: id }) : invalid;
      case "invite":
        if (!uuid(id)) return invalid;
        if (action === "send" && typeof body.code === "string" && /^[A-Z0-9]{6}$/i.test(body.code)) {
          return callRpc(admin, "invite_friend", { p_user: user, p_friend: id, p_code: body.code });
        }
        return action === "accept" || action === "decline"
          ? callRpc(admin, "reply_to_invite", { p_user: user, p_invite: id, p_password: password ?? "", p_accept: action === "accept" })
          : invalid;
      case "activity":
        return uuid(id) && (body.activity === null || ["online", "computer", "local", "spectating"].includes(String(body.activity)))
          ? callRpc(admin, "update_player_activity", { p_user: user, p_tab: id, p_activity: body.activity }) : invalid;
      case "spectate":
        if (action === "publish") {
          const board = sanitizeBoard(body);
          if (!board || (id !== null && !uuid(id)) || (body.kind !== "computer" && body.kind !== "local")) return invalid;
          return callRpc(admin, "publish_spectator", {
            p_user: user, p_session: id, p_kind: body.kind, p_sequence: body.sequence, p_board: board,
          });
        }
        if (!uuid(id)) return invalid;
        if (action === "authorize") return callRpc(admin, "authorize_spectator", { p_user: user, p_session: id, p_password: password ?? null });
        if (action === "stop") return callRpc(admin, "stop_spectator", { p_user: user, p_session: id });
        if (action === "room" && typeof body.enabled === "boolean") {
          return callRpc(admin, "set_room_spectators", { p_user: user, p_game: id, p_enabled: body.enabled });
        }
        return invalid;
      default:
        return { ok: false, error: "not_found" };
    }
  });
}
