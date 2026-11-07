import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

/**
 * Just enough of Supabase's platform schemas for the migrations to run in an
 * in-process Postgres: the three API roles, `auth.uid()` read from a session
 * setting, and a `realtime.send` that records what would have been broadcast.
 */
const SUPABASE_SHIM = `
  create schema if not exists auth;
  create schema if not exists realtime;
  create schema if not exists extensions;
  do $$ begin
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
  exception when duplicate_object then null; end $$;

  create table auth.users (id uuid primary key default gen_random_uuid());
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

  create table realtime.messages (
    id bigserial primary key, topic text not null, extension text not null,
    payload jsonb, event text, private boolean default true
  );
  alter table realtime.messages enable row level security;
  create function realtime.topic() returns text language sql stable as
    $$ select nullif(current_setting('realtime.topic', true), '') $$;

  create table realtime.sent (id bigserial primary key, payload jsonb, event text, topic text, private boolean);
  create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
    returns void language sql as
    $$ insert into realtime.sent (payload, event, topic, private) values (payload, event, topic, private) $$;

  grant usage on schema public, auth, realtime, extensions to anon, authenticated, service_role;
  grant select, insert on realtime.messages to authenticated;
  grant usage on sequence realtime.messages_id_seq to authenticated;
`;

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

export async function createDatabase(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_SHIM);
  for (const file of readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  return db;
}

export async function createUser(db: PGlite): Promise<string> {
  const { rows } = await db.query<{ id: string }>("insert into auth.users default values returning id");
  return rows[0]!.id;
}

/** Calls an RPC as the service role, the way the API routes do. */
export async function rpc<T = Record<string, unknown>>(
  db: PGlite,
  name: string,
  args: unknown[],
): Promise<T> {
  const placeholders = args.map((_, index) => `$${index + 1}`).join(", ");
  await db.exec("set role service_role");
  try {
    const { rows } = await db.query<{ result: T }>(
      `select public.${name}(${placeholders}) as result`,
      args,
    );
    return rows[0]!.result;
  } finally {
    await db.exec("reset role");
  }
}

/** Runs a query as a signed-in browser user, with RLS in force. */
export async function asUser<T>(
  db: PGlite,
  userId: string | null,
  sql: string,
  params: unknown[] = [],
  topic?: string,
): Promise<T[]> {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
  await db.query("select set_config('realtime.topic', $1, false)", [topic ?? ""]);
  try {
    const { rows } = await db.query<T>(sql, params);
    return rows;
  } finally {
    await db.exec("reset role");
  }
}
