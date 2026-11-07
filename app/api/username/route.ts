import { NextResponse } from "next/server";
import { callRpc, respond } from "@/lib/multiplayer/http";
import { getAdminClient } from "@/lib/supabase/server";

/**
 * `GET /api/username?name=x`: is the name free? Public, because people check
 * before they have an account; rate limited per client address. Advisory only:
 * the unique index decides at sign-up.
 */
export async function GET(request: Request) {
  const admin = getAdminClient();
  if (!admin) return respond({ ok: false, error: "not_configured" });
  const name = new URL(request.url).searchParams.get("name") ?? "";
  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  try {
    return respond(await callRpc(admin, "username_available", { p_username: name, p_key: client }));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[gambit api] op=GET /api/username category=database detail=${detail}`);
    const setup = /PGRST202|42883/.test(detail);
    return NextResponse.json({ ok: false, error: setup ? "setup_incomplete" : "try_again" }, { status: setup ? 503 : 500 });
  }
}
