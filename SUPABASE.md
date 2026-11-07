# Supabase setup

Accounts and online play (matchmaking, private rooms, live games) need a
Supabase project. Offline modes need none of this.

**Check your project at any time:** `npm run db:verify`. It reads `.env.local`,
changes nothing, and reports which of the steps below are still missing.

## What the repository does vs. what you do

| Done by the code (nothing to configure) | Needs you, in the Supabase Dashboard |
| --- | --- |
| Tables, RLS policies, grants, functions, triggers, Realtime authorisation — in `supabase/migrations/` | Running the migrations on your project (step 1) |
| Profile creation on sign-up, username uniqueness, password-room hashing | Auth provider, email confirmation, redirect URLs (step 2) |
| Session refresh and persistence (supabase-js, localStorage) | Email delivery (SMTP) for real users (step 2) |
| Server-side move validation and clocks | Realtime "private only" switch (step 3) |
| Clear setup errors in the UI when something is missing | Keys in your environment (step 4) |

## 1. Apply the migrations

Run both files, in order, on the project (each is additive and safe to re-run):

1. `supabase/migrations/20261107000000_online_play.sql` — online play.
2. `supabase/migrations/20261108000000_accounts.sql` — usernames, sign-up
   trigger on `auth.users`, statistics, room fixes.

- **Supabase CLI:** `supabase link --project-ref <ref>` then `supabase db push`.
- **Dashboard:** SQL Editor → paste a file → Run (first one, then the second).

Apply them to a test project first. Nothing in this repo touches a database by
itself, and neither migration deletes users, games or rooms. Until the second
migration runs, account features answer "The server's database is missing
Gambit's latest migration".

## 2. Authentication

| Where (Dashboard) | Setting | Value |
| --- | --- | --- |
| Authentication → Sign In / Providers → **Email** | Enable email provider | On |
| same | **Confirm email** | On (recommended). Sign-up then shows "Check your email" until the link is opened |
| same | Minimum password length | 8 or more (the forms require 8) |
| Authentication → Sign In / Providers | **Allow anonymous sign-ins** | Off. Only needed if guests from the old version should be able to upgrade |
| Authentication → URL Configuration | **Site URL** | Your production URL, e.g. `https://gambit.example.com` |
| same | **Redirect URLs** | `http://localhost:3000/**` and `https://<your-domain>/**` (and preview domains, e.g. `https://*-<team>.vercel.app/**`) |
| Authentication → Emails → SMTP Settings | Custom SMTP | **Required for real users.** The built-in sender only delivers to your project's team members and is heavily rate-limited |
| Authentication → Rate Limits | Emails / sign-ups per hour | Defaults are fine; raise once custom SMTP is set |
| Authentication → Attack Protection | CAPTCHA | Optional; needs a client change to pass the token |

Links in emails come back to these pages, which must be allowed by the
Redirect URLs above:

- Sign-up confirmation → `/auth/callback?next=…`
- Password recovery → `/reset-password`
- Guest upgrade (email confirmation) → `/reset-password?mode=set`

The default email templates work as they are.

## 3. Realtime

| Where | Setting | Value |
| --- | --- | --- |
| Realtime → Settings | **Allow public access** | Off — every Gambit channel is private and authorised by RLS |

## 4. Environment variables

Copy `.env.example` to `.env.local` (git-ignored) for development, and set the
same variables on your host for production:

| Variable | Where from | Exposure |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API | Browser (public) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API Keys → Publishable | Browser (public) |
| `SUPABASE_SECRET_KEY` | Project Settings → API Keys → Secret | **Server only.** Never prefix with `NEXT_PUBLIC_` |
| `CRON_SECRET` | Any long random string | Server only; see step 5 |

On Vercel: Project → Settings → Environment Variables, for Production and
Preview, then redeploy.

## 5. Expired games and rooms

Clocks are checked on every move, game load, timeout claim and lobby visit, so
a game always ends correctly once someone looks at it, and a flagged game never
blocks its players from starting another. For abandoned games nobody opens,
`public.run_maintenance()` settles clocks, expires rooms and clears stale queue
entries:

- With `pg_cron` enabled (Database → Extensions) **before** running the first
  migration, it is scheduled every minute. If you enable it later, re-run it.
- Otherwise call `GET /api/maintenance` with `Authorization: Bearer $CRON_SECRET`
  from your host's cron (e.g. Vercel Cron).

## How security is arranged

- Passwords live only in Supabase Auth. Gambit's tables never see them.
- Usernames: 3–20 letters, digits or underscores, not reserved; unique
  case-insensitively through a unique index on `lower(username)`. The sign-up
  trigger refuses a taken name, so two simultaneous registrations can't both
  get it. Names stored on past games are snapshots and don't change.
- Browsers can only **read** their own profile, queue entry, games and moves
  (RLS). No table grants insert, update or delete to `anon` or `authenticated`.
- Every write is a database function executable **only by `service_role`**. The
  Next.js API verifies the caller's JWT (`auth.getClaims`), refuses anonymous
  sessions for gameplay, validates chess moves with chess.js by replaying the
  game, then calls the function with the verified user id. The function
  rechecks turn, version and clock under a row lock.
- Room passwords are bcrypt-hashed by pgcrypto. `chess_rooms` has no client
  access; listings and broadcasts use `_room_public`, which has no hash.
- Realtime topics are private: `game:{id}` (participants), `player:{uid}` (that
  user), `rooms` (any signed-in user, safe fields only).
- Rate limits cover username checks and changes, matchmaking, room creation,
  joins, moves and game actions.
- API errors never include database detail; in development they carry a
  `debug` field and every request logs a correlation id (`x-request-id`).
