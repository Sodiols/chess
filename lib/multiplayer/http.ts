import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient, getCaller } from "@/lib/supabase/server";

type RpcPayload = { ok: boolean; error?: string; [key: string]: unknown };

const STATUS: Record<string, number> = {
  unauthorized: 401,
  account_required: 403,
  not_configured: 503,
  setup_incomplete: 503,
  rate_limited: 429,
  try_again: 500,
  not_found: 404,
  room_not_found: 404,
  not_participant: 403,
  wrong_password: 403,
};

const DEV = process.env.NODE_ENV === "development";

/** A database failure, sorted so the user sees something actionable. */
class RpcError extends Error {
  constructor(
    readonly category: "setup" | "database",
    message: string,
  ) {
    super(message);
  }
}

export function respond(payload: RpcPayload, requestId?: string, debug?: string): NextResponse {
  const headers = requestId ? { "x-request-id": requestId } : undefined;
  if (payload.ok) return NextResponse.json(payload, { headers });
  const code = payload.error ?? "try_again";
  const status = STATUS[code] ?? (code.startsWith("invalid") || code === "illegal_move" ? 400 : 409);
  // Internal detail only ever leaves the server in development.
  return NextResponse.json({ ok: false, error: code, ...(DEV && debug ? { debug } : {}) }, { status, headers });
}

function log(fields: Record<string, unknown>) {
  // Operation, correlation id, auth and outcome only: never bodies, passwords or tokens.
  const line = Object.entries(fields)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  if (fields.level === "error") console.error(`[gambit api] ${line}`);
  else if (DEV) console.info(`[gambit api] ${line}`);
}

/**
 * Wraps a route: verifies the bearer token, then hands the verified user id and
 * the privileged client to the handler. Only registered accounts may play
 * online; `allowAnonymous` admits legacy guests to the routes they need to
 * upgrade. Database errors are logged here and never forwarded.
 */
export async function withPlayer(
  request: Request,
  handler: (userId: string, admin: SupabaseClient) => Promise<RpcPayload>,
  { allowAnonymous = false }: { allowAnonymous?: boolean } = {},
): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const op = `${request.method} ${new URL(request.url).pathname}`;
  const admin = getAdminClient();
  if (!admin) {
    log({ level: "error", op, requestId, category: "config", detail: "SUPABASE_SECRET_KEY or URL missing" });
    return respond({ ok: false, error: "not_configured" }, requestId);
  }

  const caller = await getCaller(request, admin);
  if (!caller) {
    log({ op, requestId, auth: "invalid" });
    return respond({ ok: false, error: "unauthorized" }, requestId);
  }
  if (caller.anonymous && !allowAnonymous) {
    log({ op, requestId, auth: "anonymous", outcome: "account_required" });
    return respond({ ok: false, error: "account_required" }, requestId);
  }

  try {
    const payload = await handler(caller.id, admin);
    log({ op, requestId, auth: "ok", outcome: payload.ok ? "ok" : payload.error });
    return respond(payload, requestId);
  } catch (error) {
    const category = error instanceof RpcError ? error.category : "server";
    const detail = error instanceof Error ? error.message : String(error);
    log({ level: "error", op, requestId, auth: "ok", category, detail });
    return respond({ ok: false, error: category === "setup" ? "setup_incomplete" : "try_again" }, requestId, detail);
  }
}

export async function callRpc(
  admin: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
): Promise<RpcPayload> {
  const { data, error } = await admin.rpc(name, args);
  if (error) {
    // PGRST202: PostgREST doesn't know the function; 42883: Postgres doesn't.
    // Both mean a migration hasn't been applied to this project.
    const missing = error.code === "PGRST202" || error.code === "42883";
    throw new RpcError(missing ? "setup" : "database", `${name}: ${error.code ?? ""} ${error.message}`);
  }
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
