# Supabase setup

Online play (matchmaking, private rooms, live games) needs a Supabase project.
Offline modes need none of this.

## 1. Apply the migration

The schema, RLS policies, functions and Realtime authorisation are in
`supabase/migrations/20261107000000_online_play.sql`. It is additive and safe to
re-run.

- **Supabase CLI:** `supabase link --project-ref <ref>` then `supabase db push`.
- **Dashboard:** SQL Editor → paste the file → Run.

Apply it to a test project first. Nothing in this repo touches a database by itself.

## 2. Dashboard settings

| Where | Setting | Value |
| --- | --- | --- |
| Authentication → Sign In / Providers | **Allow anonymous sign-ins** | On (guests can't connect without it) |
| Authentication → Rate Limits | Anonymous sign-ins per hour per IP | Keep the default (30) or lower |
| Authentication → Attack Protection | CAPTCHA (Turnstile/hCaptcha) | Recommended for production; needs a client change to pass the token to `signInAnonymously` |
| Realtime → Settings | **Allow public access** | Off — every Gambit channel is private and authorised by RLS |
| Database → Extensions | `pg_cron` | On (optional; see below) |
| Project Settings → API Keys | Publishable and secret keys | Copy into `.env.local` |

Anonymous users accumulate over time. Supabase can clean them up; deleting a
user deletes their profile and games (`on delete cascade`).

## 3. Environment variables

Copy `.env.example` to `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — browser.
- `SUPABASE_SECRET_KEY` — server only. Never prefix it with `NEXT_PUBLIC_`.

## 4. Expired games and rooms

Clocks are checked by the server on every move, every game load and every
timeout claim, so a game always ends correctly once someone looks at it. For
abandoned games nobody opens again, `public.run_maintenance()` settles expired
clocks, expires rooms whose host left and clears stale queue entries.

- With `pg_cron` enabled **before** running the migration, it is scheduled every
  minute automatically. If you enable it later, re-run the migration.
- Without `pg_cron`, call `GET /api/maintenance` with
  `Authorization: Bearer $CRON_SECRET` from your host's cron (e.g. Vercel Cron).

## How security is arranged

- Browsers can only **read** their own profile, queue entry, games and moves (RLS).
  No table grants insert, update or delete to `anon` or `authenticated`.
- Every write is a database function executable **only by `service_role`**. The
  Next.js API verifies the caller's JWT (`auth.getClaims`), validates chess moves
  with chess.js by replaying the full move list, then calls the function with the
  verified user id. The function rechecks turn, version and clock under a row lock.
- Room passwords are bcrypt-hashed by pgcrypto. `chess_rooms` has no client
  access at all; listings and broadcasts use `_room_public`, which has no hash.
- Realtime topics are private: `game:{id}` (participants; presence allowed),
  `player:{uid}` (that user) and `rooms` (any signed-in guest, safe fields only).
- Rate limits (per user, fixed window) cover nickname changes, matchmaking, room
  creation, join/password attempts, moves, and game actions.
