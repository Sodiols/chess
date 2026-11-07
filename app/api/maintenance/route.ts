import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/server";

/**
 * Settles expired clocks and closes stale rooms. pg_cron runs the same function
 * every minute when it is enabled; this endpoint is for a platform cron instead
 * (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  const { data, error } = await admin.rpc("run_maintenance");
  if (error) {
    console.error("[gambit maintenance]", error.message);
    return NextResponse.json({ ok: false, error: "try_again" }, { status: 500 });
  }
  return NextResponse.json(data);
}
