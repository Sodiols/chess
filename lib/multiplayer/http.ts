import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient, getUserId } from "@/lib/supabase/server";

type RpcPayload = { ok: boolean; error?: string; [key: string]: unknown };

const STATUS: Record<string, number> = {
  unauthorized: 401,
  not_configured: 503,
  rate_limited: 429,
  not_found: 404,
  room_not_found: 404,
  not_participant: 403,
  wrong_password: 403,
};

export function respond(payload: RpcPayload): NextResponse {
  if (payload.ok) return NextResponse.json(payload);
  const code = payload.error ?? "try_again";
  const status = STATUS[code] ?? (code.startsWith("invalid") || code === "illegal_move" ? 400 : 409);
  return NextResponse.json({ ok: false, error: code }, { status });
}

/**
 * Wraps a route: verifies the bearer token, then hands the verified user id and
 * the privileged client to the handler. Database errors are logged server-side
 * and never forwarded, so internals don't leak.
 */
export async function withPlayer(
  request: Request,
  handler: (userId: string, admin: SupabaseClient) => Promise<RpcPayload>,
): Promise<NextResponse> {
  const admin = getAdminClient();
  if (!admin) return respond({ ok: false, error: "not_configured" });

  const userId = await getUserId(request, admin);
  if (!userId) return respond({ ok: false, error: "unauthorized" });

  try {
    return respond(await handler(userId, admin));
  } catch (error) {
    console.error("[gambit api]", error);
    return respond({ ok: false, error: "try_again" });
  }
}

export async function callRpc(
  admin: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
): Promise<RpcPayload> {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data as RpcPayload;
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
