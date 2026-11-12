import { existsSync, readFileSync, readdirSync } from "node:fs";

if (process.argv.includes("--sql")) {
  await import("./verify-supabase-catalog.mjs");
  process.exit(0);
}
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const migrationDir = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(migrationDir).filter((file) => file.endsWith(".sql")).sort();
// Check every externally called RPC, including read-only social/profile RPCs.
// Internal functions, exact SQL signatures and grants are checked by --sql.
const rpcNames = new Set([
  "get_profile", "matchmake", "cancel_matchmaking", "create_room", "room_heartbeat", "join_room",
  "cancel_room", "list_open_rooms", "get_game_state", "submit_move", "game_action", "run_maintenance",
  "set_username", "username_available", "get_player_stats", "get_hosted_room", "submit_contact",
  "get_owner_settings", "set_owner_settings", "update_game_scene", "create_configured_room", "game_rating_result",
  "friend_action", "get_notifications", "public_player", "leaderboard", "set_country",
  "social_settings", "invite_friend", "reply_to_invite", "room_preview",
  "authorize_spectator", "get_spectator_state", "publish_spectator", "stop_spectator", "set_room_spectators",
  "update_player_activity", "get_friends", "friend_details", "_join_room",
]);
const functions = new Map();
const tables = new Map();
for (const file of files) {
  const sql = readFileSync(new URL(file, migrationDir), "utf8");
  for (const [, name, args] of sql.matchAll(/create\s+(?:or replace\s+)?function\s+public\.(\w+)\s*\(([^)]*)\)/gi)) {
    if (rpcNames.has(name)) functions.set(name, { file, args: args.match(/\bp_\w+(?=\s+\w)/g) ?? [] });
  }
  for (const [, name] of sql.matchAll(/create\s+table\s+(?:if not exists\s+)?public\.(\w+)/gi)) tables.set(name, file);
}
const columns = {
  "20261108000000_accounts.sql": { player_profiles: ["username"] },
  "20261112000000_game_reconnect.sql": { chess_games: ["presence_started_at", "white_reconnect_by", "black_reconnect_by", "paused_at"] },
  "20261113000000_competitive.sql": {
    chess_games: ["ranked", "white_rating_before", "black_rating_before", "rating_exclusion"],
    chess_rooms: ["ranked", "allow_spectators"],
    player_profiles: ["country_code", "country_changed_at"],
  },
};
let problems = 0;
const ok = (message) => console.log(`  ✓ ${message}`);
const bad = (message) => { problems++; console.log(`  ✗ ${message}`); };
const note = (message) => console.log(`  • ${message}`);
const headers = (key) => ({ apikey: key, ...(!key.startsWith("sb_") && { authorization: `Bearer ${key}` }) });
const get = (path, key) => fetch(new URL(path, url), {
  headers: headers(key), signal: AbortSignal.timeout(10_000), redirect: "error",
});

console.log("\nEnvironment");
if (!url || !publishable || !secret) {
  bad("Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY.");
  process.exit(1);
}
ok(`project ${new URL(url).host}`);
if (secret === publishable) bad("Server and browser keys are identical.");
for (const [name, value] of Object.entries(process.env)) {
  if (name.startsWith("NEXT_PUBLIC_") && /^sb_secret_/.test(value ?? "")) bad(`${name} contains a server key.`);
}

console.log("\nAuthentication");
try {
  const response = await get("/auth/v1/settings", publishable);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const settings = await response.json();
  if (settings.external?.email) ok("email sign-in enabled");
  else bad("email provider disabled or not visible");
  if (settings.disable_signup === false) ok("sign-ups allowed");
  else bad("sign-ups disabled or not visible");
  if (settings.mailer_autoconfirm === false) ok("email confirmation required");
  else bad("email confirmation disabled or not visible");
} catch (error) {
  bad(`could not verify authentication settings: ${error.message}`);
}

console.log("\nData API (read-only schema discovery)");
try {
  const response = await get("/rest/v1/", secret);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const schema = await response.json();
  if (!schema.paths || !schema.definitions) throw new Error("OpenAPI paths or definitions missing");
  for (const name of rpcNames) {
    if (!functions.has(name)) bad(`Verifier contract is missing ${name} in local migrations.`);
  }
  for (const file of files) {
    const defects = [];
    for (const [name, contract] of functions) {
      if (contract.file !== file) continue;
      const rpc = schema.paths[`/rpc/${name}`]?.post;
      if (!rpc) {
        defects.push(`${name} unavailable to the server key`);
        continue;
      }
      const body = rpc.parameters?.find((p) => p.in === "body")?.schema;
      const params = body?.properties ?? {};
      if (Object.keys(params).length !== contract.args.length || contract.args.some((arg) => !(arg in params))) {
        defects.push(`${name} argument names differ (expected ${contract.args.join(", ")})`);
      }
    }
    for (const [name, source] of tables) {
      if (source === file && !schema.paths[`/${name}`]) defects.push(`${name} unavailable to the server key`);
    }
    for (const [name, expected] of Object.entries(columns[file] ?? {})) {
      const actual = schema.definitions[name]?.properties ?? {};
      for (const column of expected) if (!(column in actual)) defects.push(`${name}.${column} missing`);
    }
    if (defects.length) bad(`${file}: ${defects.join("; ")}`);
    else ok(`${file}: declared API tables and RPC arguments visible where applicable`);
  }
  // HEAD is safe for this read-only list function and never sends/prints room records.
  const probe = await fetch(new URL("/rest/v1/rpc/list_open_rooms", url), {
    method: "HEAD", headers: headers(publishable), signal: AbortSignal.timeout(10_000), redirect: "error",
  });
  if (probe.ok) bad("list_open_rooms is accessible using the browser key.");
  else if ([401, 403, 404].includes(probe.status)) ok(`browser-key list_open_rooms probe denied (HTTP ${probe.status})`);
  else bad(`browser-key probe inconclusive (HTTP ${probe.status})`);
} catch (error) {
  bad(`could not verify Data API contract: ${error.message}`);
}

note("Catalog checks require SQL Editor access. Run npm run db:verify -- --sql and execute its SELECT in the target project.");
note("Dashboard Realtime settings, email delivery, authenticated behavior and cron execution require separate checks.");
console.log(problems ? `\n${problems} failure(s) in the API checks.\n` : "\nAPI checks passed. Full production verification is still pending catalog and live flow checks.\n");
process.exitCode = problems ? 1 : 0;
