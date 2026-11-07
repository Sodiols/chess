# Gambit

Chess online and offline, built with Next.js 16, React 19, chess.js and Supabase.

| Mode | Route | Needs Supabase |
| --- | --- | --- |
| Play Online — random matchmaking by time control | `/play/online` | Yes |
| Private Match — password rooms, room browser | `/play/rooms` | Yes |
| Play Computer — Beginner / Medium / Pro engine | `/play/computer` | No |
| Local 1v1 — two players, one device | `/play/local` | No |

Board **assistance** (Beginner / Medium / Pro hints) is separate from **computer
difficulty**; the two never affect each other.

## Run locally

```bash
npm install
cp .env.example .env.local   # optional: only needed for online play
npm run dev
```

Online setup (migration, dashboard switches, keys) is in [SUPABASE.md](SUPABASE.md).

## Checks

```bash
npm run lint
npm run typecheck
npm run test       # unit, component and real-SQL tests (PGlite)
npm run build
npm run test:e2e   # two-browser online match; needs E2E_BASE_URL and a test project
```

`npm run test` runs the actual migration in an in-process Postgres (PGlite) with a
small shim for Supabase's `auth` and `realtime` schemas, so matchmaking, rooms,
moves, clocks and RLS are tested against real SQL.

## How it fits together

- **Offline** games keep using `useChessGame` and the local `ChessClock`. The
  computer (`lib/computer`) is an alpha-beta search with quiescence and
  piece-square evaluation over chess.js, running in a Web Worker that loads only
  when a computer game starts.
- **Online** games are server-authoritative. The browser shows moves
  optimistically; `POST /api/games/:id/move` replays the game with chess.js,
  validates the move, and a `service_role`-only database function commits it with
  version, turn and clock checks under a row lock. A database trigger broadcasts
  the committed row on a private Realtime channel; clients reconcile by version
  and refetch on any gap, reconnect or tab focus.
- Clocks run on database time. Clients animate them from server timestamps and
  only ever *ask* the server to settle a flag.

## Deploy

1. Create a Supabase project and follow [SUPABASE.md](SUPABASE.md).
2. Deploy to any Next.js host (e.g. Vercel) with the three Supabase variables set.
   `SUPABASE_SECRET_KEY` must be a server-only variable.
3. Without `pg_cron`, schedule `GET /api/maintenance` every minute with
   `Authorization: Bearer $CRON_SECRET`.

## Known limitations

- The computer engine is a compact search (Pro reaches about depth 5–6 in two
  seconds); it plays solid club-level chess, not master strength. Stockfish WASM
  would be the upgrade path.
- Disconnects never forfeit by themselves; an absent player's clock keeps
  running and the game ends on time.
- Online boards use the Medium assistance level for both players.
- Anonymous guests are tied to one browser's storage; clearing it starts a new guest.
