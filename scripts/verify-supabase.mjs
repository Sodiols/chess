// Read-only check of a Supabase project against what Gambit needs.
// Usage: npm run db:verify   (reads .env.local; changes nothing)
//
// Reports: auth settings, whether every Gambit database function is deployed
// (i.e. both migrations ran), and that none is exposed to browser keys.

import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;

const MIGRATIONS = {
  "20261107000000_online_play.sql": [
    "get_profile", "matchmake", "cancel_matchmaking", "create_room", "room_heartbeat", "join_room",
    "cancel_room", "list_open_rooms", "get_game_state", "submit_move", "game_action", "run_maintenance",
  ],
  "20261108000000_accounts.sql": ["set_username", "username_available", "get_player_stats", "get_hosted_room"],
};

let problems = 0;
const ok = (message) => console.log(`  ✓ ${message}`);
const bad = (message) => {
  problems++;
  console.log(`  ✗ ${message}`);
};
const note = (message) => console.log(`  • ${message}`);

async function openapi(key) {
  const response = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, authorization: `Bearer ${key}` } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  return new Set(Object.keys(body.paths ?? {}).filter((path) => path.startsWith("/rpc/")).map((path) => path.slice(5)));
}

console.log("\nEnvironment");
if (!url || !publishable) {
  bad("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY not set — online play is disabled");
  process.exit(1);
}
ok(`project ${new URL(url).host}`);
if (secret) ok("SUPABASE_SECRET_KEY set (server only)");
else bad("SUPABASE_SECRET_KEY not set — API routes answer not_configured");
for (const [name, value] of Object.entries(process.env)) {
  if (name.startsWith("NEXT_PUBLIC_") && /^sb_secret_/.test(value ?? "")) bad(`${name} holds a secret key — it would ship to browsers`);
}

console.log("\nAuthentication");
try {
  const settings = await (await fetch(`${url}/auth/v1/settings`, { headers: { apikey: publishable } })).json();
  if (settings.external?.email) ok("email sign-in enabled");
  else bad("email provider disabled — Authentication → Sign In / Providers → Email");
  if (settings.disable_signup) bad("new sign-ups are disabled — Authentication → Sign In / Providers");
  else ok("sign-ups allowed");
  if (settings.mailer_autoconfirm) note("email confirmation is OFF — accounts are usable without verifying their address");
  else ok("email confirmation required");
  if (settings.external?.anonymous_users) note("anonymous sign-ins are ON — only needed to upgrade old guests; can be turned off");
  else ok("anonymous sign-ins off");
} catch (error) {
  bad(`couldn't read auth settings: ${error.message}`);
}

console.log("\nDatabase functions");
if (secret) {
  try {
    const visible = await openapi(secret);
    for (const [file, functions] of Object.entries(MIGRATIONS)) {
      const missing = functions.filter((name) => !visible.has(name));
      if (missing.length === 0) ok(`${file} applied`);
      else bad(`${file} not applied (missing ${missing.join(", ")}) — run it in the SQL editor or \`supabase db push\``);
    }
    // A read-only function: with the browser key it must be refused.
    const probe = await fetch(`${url}/rest/v1/rpc/list_open_rooms`, {
      method: "POST",
      headers: { apikey: publishable, authorization: `Bearer ${publishable}`, "content-type": "application/json" },
      body: "{}",
    });
    if (probe.ok) bad("list_open_rooms is callable with the publishable key — re-run the migrations to restore grants");
    else ok(`Gambit functions refuse the publishable key (HTTP ${probe.status})`);
  } catch (error) {
    bad(`couldn't read the schema: ${error.message}`);
  }
} else {
  note("skipped (needs SUPABASE_SECRET_KEY)");
}

console.log(problems ? `\n${problems} problem(s) found.\n` : "\nAll checks passed.\n");
process.exit(problems ? 1 : 0);
