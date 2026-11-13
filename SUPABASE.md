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

Apply each migration once, in order, on the project:

1. `supabase/migrations/20261107000000_online_play.sql` — online play.
2. `supabase/migrations/20261108000000_accounts.sql` — usernames, sign-up
   trigger on `auth.users`, statistics, room fixes.
3. `supabase/migrations/20261109000000_contact.sql` — contact form messages
   (read them in Table Editor → `contact_messages`).
4. `supabase/migrations/20261110000000_owner_settings.sql` — owner-only Secret Mode:
   the owner check (confirmed owner email in `auth.users`) and the private
   `owner_settings` table, reachable only through the API.
5. `supabase/migrations/20261112000000_game_reconnect.sql` — 30-second matchmaking
   expiry and online game reconnect grace.
6. `supabase/migrations/20261113000000_competitive.sql` — prematch rating snapshots,
   rating transactions, ranked/casual rooms, and terminal-result settlement.
7. `supabase/migrations/20261113000001_social_rankings.sql` — public profiles,
   leaderboard queries, countries, friendships, and notifications.
8. `supabase/migrations/20261113000002_invitations.sql` — social preferences,
   room previews, invitations, and expiry.
9. `supabase/migrations/20261113000003_spectating.sql` — activity leases,
   private Presence, spectator sessions and permissions, and maintenance.
10. `supabase/migrations/20261114000000_stabilize_multiplayer.sql` — consistent room
    and invitation lock order, repeatable invitation acceptance, versioned
    draw/rematch changes, and serialized private spectator revocation.
11. `supabase/migrations/20261114000001_live_spectator_lobby.sql` — live match
    discovery for the Spectate lobby using the existing spectator permissions.

- **Supabase CLI:** `supabase link --project-ref <ref>` then `supabase db push`.
- **Dashboard:** SQL Editor → paste a file → Run (each file in order).

Apply them to a test project first. Nothing in this repo touches a database by
itself, and the migrations preserve existing users, games and rooms. Until the second
migration runs, account features answer "The server's database is missing
Gambit's latest migration".

### Read-only deployment diagnostics

Run `npm run db:verify` to check the configured Auth settings and PostgREST API
surface. An unavailable RPC can mean an unapplied migration, missing grants,
or a stale PostgREST schema cache. After applying migrations, reload the schema
with `notify pgrst, 'reload schema';` if the Data API still reports old signatures.

For exact catalog verification, generate the diagnostic query with
`npm run --silent db:verify -- --sql`. Paste its SQL output into the target
project's SQL Editor. It compares tables, columns, grants, function bodies
and signatures, triggers, indexes, constraints, and RLS policies against a
fresh database built from this checkout. It also checks the migration ledger
and the `gambit-maintenance` job using a single read-only query. A missing
ledger entry can occur when a migration was run manually. Review the catalog
differences before deciding whether any repair is needed.

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

Clocks and reconnect deadlines are checked on game loads, moves, and scene heartbeats, so
a game always ends correctly once someone looks at it, and a flagged game never
blocks its players from starting another. For abandoned games nobody opens,
`public.run_maintenance()` settles clocks and reconnect deadlines, expires rooms and clears stale queue
entries:

- With `pg_cron` enabled (Database → Extensions) **before** running the first
  migration, it is scheduled every minute. If you enable it later, re-run it.
- Otherwise call `GET /api/maintenance` with `Authorization: Bearer $CRON_SECRET`
  from your host's cron (e.g. Vercel Cron).

## Competitive and social play

- New accounts with usernames start at 1,000 points. Existing accounts with usernames
  also receive that starting balance. Existing games do not award retroactive points.
- Matchmaking is ranked. New private rooms default to Ranked and can be set to Casual.
  A ranked private room requires 8 half-moves and only the first two eligible results
  per pair in a rolling 24 hours count. Direct rematches are casual.
- On a win or loss, add the opponent's rating minus the player's rating, divided by 100
  and truncated toward zero, to the tier's base change. Clamp that adjustment to
  −6 through +6. Draws use their tier base. The rating floor is zero.
- World, country, and friends standings use the same rating. Eligibility begins
  with the first rated result. Sort by rating, then ranked wins, then stable player
  ID. Country is self-reported in account settings and has a 30-day change cooldown.
- Keep Realtime private-only. Player game topics remain participant-only. The new
  `watch:*` topics send board-change signals, and each snapshot request checks
  viewer authorization again. `notifications:*` is recipient-only. Private
  `activity:*` Presence topics are scoped to the player and accepted friends.
- Both players must opt in to online spectating. Ranked games also require both
  ranked-spectator settings. Private rooms require host enablement, friendship
  with the host, and the room password. Local and computer sharing requires
  explicit opt-in. Activity leases and spectator sessions use the existing
  scheduled maintenance job.
- Public routes are `/leaderboard` and `/u/[username]`. Signed-in features use
  `/friends` and `/spectate/[sessionId]`. The API uses `/api/social/[resource]`
  with resources for profiles, standings, rating history and results, friends,
  notifications, privacy, country selection, room previews and invitations,
  activity, and spectating.
- The authenticated three-context Playwright suite needs three confirmed accounts
  with usernames on a test project, including `E2E_USER_C_EMAIL` and
  `E2E_USER_C_PASSWORD` in addition to the A/B credentials. It changes social
  preferences, friendships, and competitive ratings in that test project.

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
