-- Gambit online play: profiles, matchmaking, rooms, authoritative games.
--
-- Every mutation goes through a function that only `service_role` may execute.
-- The Next.js API verifies the caller's JWT, validates chess moves with chess.js,
-- and passes the verified user id in. Browsers can read their own rows through
-- RLS and subscribe to private Realtime topics, but cannot write anything.
--
-- Safe to re-run: tables use IF NOT EXISTS, functions CREATE OR REPLACE,
-- policies and triggers are dropped before being recreated.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.player_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 20),
  -- At most one live game per player; set and cleared only inside transactions
  -- that hold this row's lock.
  active_game_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chess_games (
  id uuid primary key default gen_random_uuid(),
  origin text not null check (origin in ('matchmaking', 'room', 'rematch')),
  room_id uuid,
  white_id uuid not null references public.player_profiles (id) on delete cascade,
  black_id uuid not null references public.player_profiles (id) on delete cascade,
  -- Names as they were when the game began, so history never changes underneath.
  white_name text not null,
  black_name text not null,
  status text not null default 'active' check (status in ('active', 'finished')),
  turn text not null default 'w' check (turn in ('w', 'b')),
  fen text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  ply integer not null default 0 check (ply >= 0),
  -- Bumped by every move and by the result; moves must name the version they saw.
  version integer not null default 0 check (version >= 0),
  initial_ms integer not null check (initial_ms between 60000 and 10800000),
  increment_ms integer not null check (increment_ms between 0 and 60000),
  -- Remaining time as of `turn_started_at`; the side to move is draining since then.
  white_ms integer not null check (white_ms >= 0),
  black_ms integer not null check (black_ms >= 0),
  turn_started_at timestamptz not null default now(),
  result text check (result in ('white', 'black', 'draw')),
  result_reason text check (result_reason in (
    'checkmate', 'resignation', 'timeout', 'stalemate', 'threefold-repetition',
    'fifty-move-rule', 'insufficient-material', 'agreement', 'timeout-insufficient-material'
  )),
  draw_offered_by uuid,
  rematch_requested_by uuid,
  rematch_game_id uuid references public.chess_games (id) on delete set null,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint chess_games_distinct_players check (white_id <> black_id),
  constraint chess_games_result_matches_status check ((status = 'finished') = (result is not null)),
  constraint chess_games_draw_offer_by_player check (
    draw_offered_by is null or draw_offered_by in (white_id, black_id)
  ),
  constraint chess_games_rematch_by_player check (
    rematch_requested_by is null or rematch_requested_by in (white_id, black_id)
  )
);

create index if not exists chess_games_white_idx on public.chess_games (white_id, created_at desc);
create index if not exists chess_games_black_idx on public.chess_games (black_id, created_at desc);
create index if not exists chess_games_active_idx on public.chess_games (turn_started_at)
  where status = 'active';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'player_profiles_active_game_fk') then
    alter table public.player_profiles
      add constraint player_profiles_active_game_fk
      foreign key (active_game_id) references public.chess_games (id) on delete set null;
  end if;
end $$;

create table if not exists public.chess_moves (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.chess_games (id) on delete cascade,
  ply integer not null check (ply >= 1),
  player_id uuid not null,
  from_sq text not null check (from_sq ~ '^[a-h][1-8]$'),
  to_sq text not null check (to_sq ~ '^[a-h][1-8]$'),
  promotion text check (promotion in ('q', 'r', 'b', 'n')),
  san text not null check (char_length(san) between 2 and 10),
  fen_after text not null,
  -- Mover's remaining time once the move landed, increment included.
  clock_ms integer not null check (clock_ms >= 0),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  constraint chess_moves_ply_unique unique (game_id, ply),
  constraint chess_moves_request_unique unique (game_id, request_id)
);

create table if not exists public.matchmaking_queue (
  -- One entry per player: a second search replaces the first.
  player_id uuid primary key references public.player_profiles (id) on delete cascade,
  initial_ms integer not null check (initial_ms between 60000 and 10800000),
  increment_ms integer not null check (increment_ms between 0 and 60000),
  created_at timestamptz not null default now(),
  -- Kept alive by the searching client's heartbeat; stale entries are never matched.
  expires_at timestamptz not null
);

create index if not exists matchmaking_queue_bucket_idx
  on public.matchmaking_queue (initial_ms, increment_ms, created_at);

create table if not exists public.chess_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  name text not null check (char_length(name) between 1 and 40),
  host_id uuid not null references public.player_profiles (id) on delete cascade,
  host_name text not null,
  guest_id uuid references public.player_profiles (id) on delete cascade,
  -- bcrypt via pgcrypto. Never selected by anything a browser can reach.
  password_hash text not null,
  discoverable boolean not null default true,
  initial_ms integer not null check (initial_ms between 60000 and 10800000),
  increment_ms integer not null check (increment_ms between 0 and 60000),
  host_color text not null check (host_color in ('w', 'b', 'random')),
  status text not null default 'waiting'
    check (status in ('waiting', 'started', 'cancelled', 'expired')),
  game_id uuid references public.chess_games (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Kept alive by the host's heartbeat while they wait.
  expires_at timestamptz not null,
  constraint chess_rooms_guest_not_host check (guest_id is null or guest_id <> host_id)
);

create unique index if not exists chess_rooms_one_open_per_host
  on public.chess_rooms (host_id) where status = 'waiting';
create index if not exists chess_rooms_browse_idx
  on public.chess_rooms (expires_at) where status = 'waiting' and discoverable;

create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  hits integer not null
);

-- ---------------------------------------------------------------------------
-- Row level security: read-only, own rows only. No write policies exist, so
-- every insert/update/delete from anon or authenticated is refused.
-- ---------------------------------------------------------------------------

alter table public.player_profiles enable row level security;
alter table public.chess_games enable row level security;
alter table public.chess_moves enable row level security;
alter table public.matchmaking_queue enable row level security;
alter table public.chess_rooms enable row level security;
alter table public.rate_limits enable row level security;

revoke all on public.player_profiles, public.chess_games, public.chess_moves,
  public.matchmaking_queue, public.chess_rooms, public.rate_limits
  from anon, authenticated;
grant select on public.player_profiles, public.chess_games, public.chess_moves,
  public.matchmaking_queue to authenticated;
grant all on public.player_profiles, public.chess_games, public.chess_moves,
  public.matchmaking_queue, public.chess_rooms, public.rate_limits to service_role;

drop policy if exists "profiles: read own" on public.player_profiles;
create policy "profiles: read own" on public.player_profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "games: participants read" on public.chess_games;
create policy "games: participants read" on public.chess_games
  for select to authenticated using ((select auth.uid()) in (white_id, black_id));

drop policy if exists "moves: participants read" on public.chess_moves;
create policy "moves: participants read" on public.chess_moves
  for select to authenticated using (
    exists (
      select 1 from public.chess_games g
      where g.id = game_id and (select auth.uid()) in (g.white_id, g.black_id)
    )
  );

drop policy if exists "queue: read own" on public.matchmaking_queue;
create policy "queue: read own" on public.matchmaking_queue
  for select to authenticated using ((select auth.uid()) = player_id);

-- chess_rooms and rate_limits intentionally have no policies: rooms are listed
-- through `list_open_rooms`, which returns safe columns only.

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

-- Fixed-window counter. Returns false once `p_max` hits land inside the window.
-- Callers return an error rather than raising, so the hit is still recorded.
create or replace function public._rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_hits integer;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds)
      then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds)
      then now() else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end;
$$;

create or replace function public._error(p_code text)
returns jsonb
language sql
immutable
set search_path = ''
as $$ select jsonb_build_object('ok', false, 'error', p_code) $$;

-- Cryptographically random bit, used for colour assignment.
create or replace function public._coin_flip()
returns boolean
language sql
volatile
set search_path = ''
as $$ select (get_byte(extensions.gen_random_bytes(1), 0) & 1) = 1 $$;

create or replace function public._ensure_profile(p_user uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_adjectives text[] := array['Swift', 'Quiet', 'Bold', 'Clever', 'Brave', 'Calm', 'Sharp', 'Lucky'];
  v_pieces text[] := array['Knight', 'Bishop', 'Rook', 'Pawn', 'Queen', 'King'];
begin
  insert into public.player_profiles (id, nickname)
  values (
    p_user,
    v_adjectives[1 + floor(random() * array_length(v_adjectives, 1))::int]
      || v_pieces[1 + floor(random() * array_length(v_pieces, 1))::int]
      || (10 + floor(random() * 90))::int
  )
  on conflict (id) do nothing;
end;
$$;

-- Whether `p_color` still has mating material, read from the FEN placement.
-- Mirrors `canEverMate` in lib/chess/material.ts: any pawn, rook or queen, or
-- two minor pieces.
create or replace function public.fen_can_mate(p_fen text, p_color text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_board text := split_part(p_fen, ' ', 1);
  v_side text;
begin
  v_side := case when p_color = 'w'
    then regexp_replace(v_board, '[^PNBRQ]', '', 'g')
    else regexp_replace(v_board, '[^pnbrq]', '', 'g') end;
  if v_side ~ '[PRQprq]' then
    return true;
  end if;
  return char_length(v_side) >= 2;
end;
$$;

-- Remaining time for the side to move, as of now.
create or replace function public._remaining_ms(g public.chess_games)
returns integer
language sql
stable
set search_path = ''
as $$
  select greatest(0, (case when g.turn = 'w' then g.white_ms else g.black_ms end)
    - floor(extract(epoch from (now() - g.turn_started_at)) * 1000)::int)
$$;

create or replace function public._create_game(
  p_white uuid, p_black uuid, p_initial integer, p_increment integer,
  p_origin text, p_room uuid
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_white public.player_profiles;
  v_black public.player_profiles;
  v_game uuid;
begin
  -- Lock in a fixed order so two transactions can never wait on each other.
  if p_white < p_black then
    select * into v_white from public.player_profiles where id = p_white for update;
    select * into v_black from public.player_profiles where id = p_black for update;
  else
    select * into v_black from public.player_profiles where id = p_black for update;
    select * into v_white from public.player_profiles where id = p_white for update;
  end if;

  if v_white.active_game_id is not null or v_black.active_game_id is not null then
    raise exception 'player_busy';
  end if;

  insert into public.chess_games (
    origin, room_id, white_id, black_id, white_name, black_name,
    initial_ms, increment_ms, white_ms, black_ms
  ) values (
    p_origin, p_room, p_white, p_black, v_white.nickname, v_black.nickname,
    p_initial, p_increment, p_initial, p_initial
  ) returning id into v_game;

  update public.player_profiles set active_game_id = v_game where id in (p_white, p_black);
  delete from public.matchmaking_queue where player_id in (p_white, p_black);
  update public.chess_rooms set status = 'cancelled'
    where host_id in (p_white, p_black) and status = 'waiting'
      and (p_room is null or id <> p_room);
  return v_game;
end;
$$;

-- Ends a locked, active game. The side to move has its clock frozen at its
-- current reading so the final display is exact.
create or replace function public._finish_game(g public.chess_games, p_result text, p_reason text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_remaining integer := public._remaining_ms(g);
begin
  update public.chess_games set
    status = 'finished',
    result = p_result,
    result_reason = p_reason,
    ended_at = now(),
    draw_offered_by = null,
    version = version + 1,
    white_ms = case when g.turn = 'w' then v_remaining else white_ms end,
    black_ms = case when g.turn = 'b' then v_remaining else black_ms end,
    turn_started_at = now()
  where id = g.id;

  update public.player_profiles set active_game_id = null
    where id in (g.white_id, g.black_id) and active_game_id = g.id;
end;
$$;

-- Settles a locked game whose side to move has run out of time. Returns
-- whether it did.
create or replace function public._settle_if_flagged(g public.chess_games)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_winner text := case when g.turn = 'w' then 'b' else 'w' end;
begin
  if g.status <> 'active' or public._remaining_ms(g) > 0 then
    return false;
  end if;
  if public.fen_can_mate(g.fen, v_winner) then
    perform public._finish_game(g, case when v_winner = 'w' then 'white' else 'black' end, 'timeout');
  else
    perform public._finish_game(g, 'draw', 'timeout-insufficient-material');
  end if;
  return true;
end;
$$;

create or replace function public._color_of(g public.chess_games, p_user uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_user = g.white_id then 'w' when p_user = g.black_id then 'b' end
$$;

create or replace function public._game_ok(p_game uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('ok', true, 'game', to_jsonb(g))
  from public.chess_games g where g.id = p_game
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create or replace function public.get_profile(p_user uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v public.player_profiles;
begin
  perform public._ensure_profile(p_user);
  select * into v from public.player_profiles where id = p_user;
  return jsonb_build_object('ok', true, 'profile', jsonb_build_object(
    'id', v.id, 'nickname', v.nickname, 'activeGameId', v.active_game_id
  ));
end;
$$;

create or replace function public.set_nickname(p_user uuid, p_nickname text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_nickname, ''), '\s+', ' ', 'g'));
begin
  if not public._rate_limit('nick:' || p_user, 10, 60) then
    return public._error('rate_limited');
  end if;
  if v_name !~ '^[A-Za-z0-9 _.-]{2,20}$' then
    return public._error('invalid_nickname');
  end if;
  perform public._ensure_profile(p_user);
  update public.player_profiles set nickname = v_name, updated_at = now() where id = p_user;
  return public.get_profile(p_user);
end;
$$;

-- ---------------------------------------------------------------------------
-- Matchmaking
-- ---------------------------------------------------------------------------

-- Joins the queue or, if a compatible opponent is waiting, starts a game with
-- them. Called again by the searching client as a heartbeat, which also
-- recovers from a missed Realtime notification.
create or replace function public.matchmake(p_user uuid, p_initial integer, p_increment integer)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_active uuid;
  v_opponent uuid;
  v_game uuid;
  v_since timestamptz;
begin
  if not public._rate_limit('mm:' || p_user, 20, 60) then
    return public._error('rate_limited');
  end if;
  if p_initial not between 60000 and 10800000 or p_increment not between 0 and 60000 then
    return public._error('invalid_time_control');
  end if;

  perform public._ensure_profile(p_user);

  -- Serialises matching within one time control, so two arrivals can never
  -- both miss each other or both claim the same waiting player.
  perform pg_advisory_xact_lock(hashtext('gambit:mm'), hashtext(p_initial || ':' || p_increment));

  select active_game_id into v_active from public.player_profiles where id = p_user for update;
  if v_active is not null then
    delete from public.matchmaking_queue where player_id = p_user;
    return jsonb_build_object('ok', true, 'status', 'matched', 'gameId', v_active);
  end if;

  select q.player_id into v_opponent
  from public.matchmaking_queue q
  join public.player_profiles p on p.id = q.player_id
  where q.initial_ms = p_initial
    and q.increment_ms = p_increment
    and q.player_id <> p_user
    and q.expires_at > now()
    and p.active_game_id is null
  order by q.created_at
  limit 1
  for update of q, p skip locked;

  if v_opponent is not null then
    if public._coin_flip() then
      v_game := public._create_game(p_user, v_opponent, p_initial, p_increment, 'matchmaking', null);
    else
      v_game := public._create_game(v_opponent, p_user, p_initial, p_increment, 'matchmaking', null);
    end if;
    return jsonb_build_object('ok', true, 'status', 'matched', 'gameId', v_game);
  end if;

  insert into public.matchmaking_queue as q (player_id, initial_ms, increment_ms, expires_at)
  values (p_user, p_initial, p_increment, now() + interval '45 seconds')
  on conflict (player_id) do update set
    created_at = case
      when q.initial_ms = excluded.initial_ms and q.increment_ms = excluded.increment_ms
      then q.created_at else now() end,
    initial_ms = excluded.initial_ms,
    increment_ms = excluded.increment_ms,
    expires_at = excluded.expires_at
  returning created_at into v_since;

  return jsonb_build_object('ok', true, 'status', 'waiting', 'since', v_since);
end;
$$;

create or replace function public.cancel_matchmaking(p_user uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_active uuid;
begin
  delete from public.matchmaking_queue where player_id = p_user;
  select active_game_id into v_active from public.player_profiles where id = p_user;
  if v_active is not null then
    return jsonb_build_object('ok', true, 'status', 'matched', 'gameId', v_active);
  end if;
  return jsonb_build_object('ok', true, 'status', 'idle');
end;
$$;

-- ---------------------------------------------------------------------------
-- Rooms
-- ---------------------------------------------------------------------------

create or replace function public._room_public(r public.chess_rooms)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'code', r.code, 'name', r.name, 'hostName', r.host_name,
    'initialMs', r.initial_ms, 'incrementMs', r.increment_ms,
    'hostColor', r.host_color, 'status', r.status, 'discoverable', r.discoverable,
    'players', case when r.guest_id is null then 1 else 2 end,
    'expiresAt', r.expires_at, 'gameId', r.game_id
  )
$$;

create or replace function public._room_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  -- 32 symbols, so each random byte maps without bias; no 0/O or 1/I.
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(6);
  v_code text := '';
begin
  for i in 0..5 loop
    v_code := v_code || substr(v_alphabet, 1 + (get_byte(v_bytes, i) % 32), 1);
  end loop;
  return v_code;
end;
$$;

create or replace function public.create_room(
  p_user uuid, p_name text, p_password text, p_initial integer, p_increment integer,
  p_color text, p_discoverable boolean
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_profile public.player_profiles;
  v_name text := btrim(coalesce(p_name, ''));
  v_room public.chess_rooms;
begin
  if not public._rate_limit('room-create:' || p_user, 5, 60) then
    return public._error('rate_limited');
  end if;
  if char_length(v_name) not between 1 and 40 then
    return public._error('invalid_room_name');
  end if;
  if p_password is null or char_length(p_password) not between 4 and 64 then
    return public._error('invalid_password');
  end if;
  if p_color not in ('w', 'b', 'random') then
    return public._error('invalid_color');
  end if;
  if p_initial not between 60000 and 10800000 or p_increment not between 0 and 60000 then
    return public._error('invalid_time_control');
  end if;

  perform public._ensure_profile(p_user);
  select * into v_profile from public.player_profiles where id = p_user for update;
  if v_profile.active_game_id is not null then
    return public._error('in_game');
  end if;

  -- A host keeps one open room; making a new one closes the old.
  update public.chess_rooms set status = 'cancelled' where host_id = p_user and status = 'waiting';
  delete from public.matchmaking_queue where player_id = p_user;

  for attempt in 1..8 loop
    begin
      insert into public.chess_rooms (
        code, name, host_id, host_name, password_hash, discoverable,
        initial_ms, increment_ms, host_color, expires_at
      ) values (
        public._room_code(), v_name, p_user, v_profile.nickname,
        extensions.crypt(p_password, extensions.gen_salt('bf', 8)),
        coalesce(p_discoverable, true), p_initial, p_increment, p_color,
        now() + interval '2 minutes'
      ) returning * into v_room;
      return jsonb_build_object('ok', true, 'room', public._room_public(v_room));
    exception when unique_violation then
      -- Code collision; draw another.
      null;
    end;
  end loop;
  return public._error('try_again');
end;
$$;

-- Host heartbeat. Extends a waiting room and reports its state, which doubles
-- as the fallback when the "game started" broadcast was missed.
create or replace function public.room_heartbeat(p_user uuid, p_code text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_room public.chess_rooms;
begin
  update public.chess_rooms set expires_at = now() + interval '2 minutes'
    where code = upper(p_code) and host_id = p_user and status = 'waiting' and expires_at > now()
    returning * into v_room;
  if v_room.id is null then
    select * into v_room from public.chess_rooms where code = upper(p_code) and host_id = p_user;
  end if;
  if v_room.id is null then
    return public._error('room_not_found');
  end if;
  return jsonb_build_object('ok', true, 'room', public._room_public(v_room));
end;
$$;

create or replace function public.join_room(p_user uuid, p_code text, p_password text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_room public.chess_rooms;
  v_host public.player_profiles;
  v_guest public.player_profiles;
  v_host_white boolean;
  v_game uuid;
begin
  if not public._rate_limit('room-join:' || p_user, 10, 60) then
    return public._error('rate_limited');
  end if;
  if coalesce(p_code, '') !~* '^[A-HJ-NP-Z2-9]{6}$' then
    return public._error('room_not_found');
  end if;

  perform public._ensure_profile(p_user);

  select * into v_room from public.chess_rooms where code = upper(p_code) for update;
  if v_room.id is null then
    return public._error('room_not_found');
  end if;
  -- A repeated join by the same guest returns the same game.
  if v_room.status = 'started' and v_room.guest_id = p_user then
    return jsonb_build_object('ok', true, 'gameId', v_room.game_id);
  end if;
  if v_room.host_id = p_user then
    return public._error('own_room');
  end if;
  if v_room.status = 'started' or v_room.guest_id is not null then
    return public._error('room_full');
  end if;
  if v_room.status <> 'waiting' or v_room.expires_at <= now() then
    return public._error('room_closed');
  end if;
  if extensions.crypt(coalesce(p_password, ''), v_room.password_hash) <> v_room.password_hash then
    return public._error('wrong_password');
  end if;

  if v_room.host_id < p_user then
    select * into v_host from public.player_profiles where id = v_room.host_id for update;
    select * into v_guest from public.player_profiles where id = p_user for update;
  else
    select * into v_guest from public.player_profiles where id = p_user for update;
    select * into v_host from public.player_profiles where id = v_room.host_id for update;
  end if;
  if v_guest.active_game_id is not null then
    return public._error('in_game');
  end if;
  if v_host.active_game_id is not null then
    return public._error('host_unavailable');
  end if;

  v_host_white := case v_room.host_color
    when 'w' then true when 'b' then false else public._coin_flip() end;

  if v_host_white then
    v_game := public._create_game(v_room.host_id, p_user, v_room.initial_ms, v_room.increment_ms, 'room', v_room.id);
  else
    v_game := public._create_game(p_user, v_room.host_id, v_room.initial_ms, v_room.increment_ms, 'room', v_room.id);
  end if;

  update public.chess_rooms set status = 'started', guest_id = p_user, game_id = v_game
    where id = v_room.id;
  return jsonb_build_object('ok', true, 'gameId', v_game);
end;
$$;

create or replace function public.cancel_room(p_user uuid, p_code text)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  update public.chess_rooms set status = 'cancelled'
    where code = upper(p_code) and host_id = p_user and status = 'waiting';
  return jsonb_build_object('ok', true);
end;
$$;

-- Discoverable open rooms in random order, safe columns only.
create or replace function public.list_open_rooms()
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select jsonb_build_object('ok', true, 'rooms', coalesce(jsonb_agg(public._room_public(r)), '[]'::jsonb))
  from (
    select * from public.chess_rooms
    where status = 'waiting' and discoverable and expires_at > now()
    order by random()
    limit 60
  ) r
$$;

-- ---------------------------------------------------------------------------
-- Games
-- ---------------------------------------------------------------------------

create or replace function public.get_game_state(p_game uuid, p_user uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  g public.chess_games;
begin
  select * into g from public.chess_games where id = p_game for update;
  if g.id is null or public._color_of(g, p_user) is null then
    return public._error('not_found');
  end if;
  -- A game read after its deadline is settled on the spot.
  perform public._settle_if_flagged(g);

  return jsonb_build_object(
    'ok', true,
    'game', (select to_jsonb(x) from public.chess_games x where x.id = p_game),
    'moves', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.ply) from public.chess_moves m where m.game_id = p_game
    ), '[]'::jsonb),
    'serverNow', clock_timestamp()
  );
end;
$$;

-- Commits a move the API has already validated with chess.js against the
-- position at `p_expected_version`. Rechecks everything that can change under
-- concurrency: version, turn, status and the clock.
create or replace function public.submit_move(
  p_game uuid, p_user uuid, p_expected_version integer, p_request_id uuid,
  p_from text, p_to text, p_promotion text, p_san text, p_fen_after text,
  p_result text, p_reason text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  g public.chess_games;
  v_color text;
  v_remaining integer;
  v_move public.chess_moves;
begin
  if not public._rate_limit('move:' || p_user, 120, 60) then
    return public._error('rate_limited');
  end if;

  select * into g from public.chess_games where id = p_game for update;
  if g.id is null then
    return public._error('not_found');
  end if;
  v_color := public._color_of(g, p_user);
  if v_color is null then
    return public._error('not_participant');
  end if;

  -- Checked under the lock, so a retried request can never land twice.
  select * into v_move from public.chess_moves where game_id = p_game and request_id = p_request_id;
  if v_move.id is not null then
    return public._game_ok(p_game) || jsonb_build_object('duplicate', true, 'move', to_jsonb(v_move));
  end if;

  if g.status <> 'active' then
    return public._error('game_over');
  end if;
  if g.turn <> v_color then
    return public._error('not_your_turn');
  end if;
  if g.version <> p_expected_version then
    return public._error('stale');
  end if;
  if public._settle_if_flagged(g) then
    return public._error('flagged');
  end if;
  if p_result is not null and (p_result not in ('white', 'black', 'draw') or p_reason is null) then
    return public._error('invalid_result');
  end if;

  v_remaining := public._remaining_ms(g) + g.increment_ms;

  insert into public.chess_moves (
    game_id, ply, player_id, from_sq, to_sq, promotion, san, fen_after, clock_ms, request_id
  ) values (
    p_game, g.ply + 1, p_user, p_from, p_to, p_promotion, p_san, p_fen_after, v_remaining, p_request_id
  ) returning * into v_move;

  update public.chess_games set
    fen = p_fen_after,
    ply = ply + 1,
    version = version + 1,
    turn = case when v_color = 'w' then 'b' else 'w' end,
    white_ms = case when v_color = 'w' then v_remaining else white_ms end,
    black_ms = case when v_color = 'b' then v_remaining else black_ms end,
    turn_started_at = now(),
    -- Moving declines the opponent's standing offer; one's own offer stands.
    draw_offered_by = case when p_result is null and draw_offered_by = p_user then draw_offered_by end,
    status = case when p_result is null then 'active' else 'finished' end,
    result = p_result,
    result_reason = p_reason,
    ended_at = case when p_result is null then null else now() end
  where id = p_game;

  if p_result is not null then
    update public.player_profiles set active_game_id = null
      where id in (g.white_id, g.black_id) and active_game_id = p_game;
  end if;

  return public._game_ok(p_game) || jsonb_build_object('move', to_jsonb(v_move));
end;
$$;

-- Resign, draw offers, timeout claims and rematches.
create or replace function public.game_action(p_game uuid, p_user uuid, p_action text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  g public.chess_games;
  v_color text;
  v_opponent uuid;
  v_new uuid;
begin
  if not public._rate_limit('action:' || p_user, 30, 60) then
    return public._error('rate_limited');
  end if;

  select * into g from public.chess_games where id = p_game for update;
  if g.id is null then
    return public._error('not_found');
  end if;
  v_color := public._color_of(g, p_user);
  if v_color is null then
    return public._error('not_participant');
  end if;
  v_opponent := case when v_color = 'w' then g.black_id else g.white_id end;

  if g.status = 'active' and public._settle_if_flagged(g) then
    return public._game_ok(p_game);
  end if;

  case p_action
    when 'claim_timeout' then
      -- Settled above if the deadline had passed; otherwise nothing to do.
      return public._game_ok(p_game);

    when 'resign' then
      if g.status <> 'active' then return public._error('game_over'); end if;
      perform public._finish_game(g, case when v_color = 'w' then 'black' else 'white' end, 'resignation');

    when 'offer_draw' then
      if g.status <> 'active' then return public._error('game_over'); end if;
      if g.draw_offered_by = v_opponent then
        -- Both sides asked: that is agreement.
        perform public._finish_game(g, 'draw', 'agreement');
      elsif g.draw_offered_by = p_user then
        return public._error('already_offered');
      else
        if not public._rate_limit('draw:' || p_game || ':' || p_user, 3, 300) then
          return public._error('rate_limited');
        end if;
        update public.chess_games set draw_offered_by = p_user where id = p_game;
      end if;

    when 'accept_draw' then
      if g.status <> 'active' then return public._error('game_over'); end if;
      if g.draw_offered_by is distinct from v_opponent then return public._error('no_offer'); end if;
      perform public._finish_game(g, 'draw', 'agreement');

    when 'decline_draw' then
      if g.draw_offered_by is distinct from v_opponent then return public._error('no_offer'); end if;
      update public.chess_games set draw_offered_by = null where id = p_game;

    when 'request_rematch' then
      if g.status <> 'finished' then return public._error('game_active'); end if;
      if g.rematch_game_id is not null then
        return public._game_ok(p_game);
      end if;
      if g.rematch_requested_by = v_opponent then
        begin
          -- Colours swap.
          v_new := public._create_game(g.black_id, g.white_id, g.initial_ms, g.increment_ms, 'rematch', null);
        exception when raise_exception then
          return public._error('opponent_busy');
        end;
        update public.chess_games set rematch_game_id = v_new where id = p_game;
      elsif g.rematch_requested_by is null then
        update public.chess_games set rematch_requested_by = p_user where id = p_game;
      end if;

    when 'decline_rematch' then
      if g.rematch_requested_by = v_opponent and g.rematch_game_id is null then
        update public.chess_games set rematch_requested_by = null where id = p_game;
      end if;

    else
      return public._error('invalid_action');
  end case;

  return public._game_ok(p_game);
end;
$$;

-- ---------------------------------------------------------------------------
-- Maintenance: settles expired clocks, closes stale rooms and queue entries.
-- Scheduled with pg_cron below when available; safe to call at any time.
-- ---------------------------------------------------------------------------

create or replace function public.run_maintenance()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  g public.chess_games;
  v_settled integer := 0;
  v_rooms integer;
begin
  for g in
    select * from public.chess_games
    where status = 'active'
      and turn_started_at + make_interval(secs => (case when turn = 'w' then white_ms else black_ms end) / 1000.0) <= now()
    for update skip locked
  loop
    if public._settle_if_flagged(g) then
      v_settled := v_settled + 1;
    end if;
  end loop;

  update public.chess_rooms set status = 'expired' where status = 'waiting' and expires_at <= now();
  get diagnostics v_rooms = row_count;
  delete from public.matchmaking_queue where expires_at <= now();
  delete from public.rate_limits where window_start < now() - interval '1 hour';

  return jsonb_build_object('ok', true, 'settledGames', v_settled, 'expiredRooms', v_rooms);
end;
$$;

-- ---------------------------------------------------------------------------
-- Realtime: private channels authorised by topic.
--   game:{id}     participants only; database broadcasts plus presence
--   player:{uid}  that user only; "game started" notifications
--   rooms         any signed-in player; room browser updates (safe fields only)
-- ---------------------------------------------------------------------------

create or replace function public.can_access_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_game uuid;
begin
  if v_uid is null or p_topic is null then
    return false;
  end if;
  if p_topic = 'rooms' or p_topic = 'player:' || v_uid::text then
    return true;
  end if;
  if p_topic like 'game:%' then
    begin
      v_game := substr(p_topic, 6)::uuid;
    exception when others then
      return false;
    end;
    return exists (
      select 1 from public.chess_games g where g.id = v_game and v_uid in (g.white_id, g.black_id)
    );
  end if;
  return false;
end;
$$;

drop policy if exists "gambit: receive authorised topics" on realtime.messages;
create policy "gambit: receive authorised topics" on realtime.messages
  for select to authenticated
  using (public.can_access_topic(realtime.topic()));

-- Clients only ever send presence, and only on their own games.
drop policy if exists "gambit: presence in own games" on realtime.messages;
create policy "gambit: presence in own games" on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension = 'presence'
    and realtime.topic() like 'game:%'
    and public.can_access_topic(realtime.topic())
  );

create or replace function public._broadcast_game()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_move jsonb;
begin
  if tg_op = 'INSERT' then
    perform realtime.send(jsonb_build_object('gameId', new.id), 'game_started', 'player:' || new.white_id, true);
    perform realtime.send(jsonb_build_object('gameId', new.id), 'game_started', 'player:' || new.black_id, true);
    return new;
  end if;

  if new.ply <> old.ply then
    select to_jsonb(m) into v_move from public.chess_moves m where m.game_id = new.id and m.ply = new.ply;
  end if;
  perform realtime.send(
    jsonb_build_object('game', to_jsonb(new), 'move', v_move, 'serverNow', clock_timestamp()),
    'game_updated', 'game:' || new.id, true
  );
  return new;
end;
$$;

drop trigger if exists chess_games_broadcast on public.chess_games;
create trigger chess_games_broadcast
  after insert or update on public.chess_games
  for each row execute function public._broadcast_game();

create or replace function public._broadcast_room()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.discoverable and (tg_op = 'INSERT' or not old.discoverable) then
    return new;
  end if;
  perform realtime.send(
    jsonb_build_object('room', public._room_public(new)),
    'room_changed', 'rooms', true
  );
  return new;
end;
$$;

drop trigger if exists chess_rooms_broadcast on public.chess_rooms;
create trigger chess_rooms_broadcast
  after insert or update on public.chess_rooms
  for each row execute function public._broadcast_room();

-- ---------------------------------------------------------------------------
-- Function privileges: everything is service_role only, except the topic check
-- that Realtime evaluates as the subscribing user.
-- ---------------------------------------------------------------------------

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      '_rate_limit', '_error', '_coin_flip', '_ensure_profile', 'fen_can_mate', '_remaining_ms',
      '_create_game', '_finish_game', '_settle_if_flagged', '_color_of', '_game_ok',
      'get_profile', 'set_nickname', 'matchmake', 'cancel_matchmaking', '_room_public',
      '_room_code', 'create_room', 'room_heartbeat', 'join_room', 'cancel_room',
      'list_open_rooms', 'get_game_state', 'submit_move', 'game_action', 'run_maintenance',
      'can_access_topic', '_broadcast_game', '_broadcast_room'
    )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

grant execute on function public.can_access_topic(text) to authenticated;

-- Optional: settle expired games and rooms every minute when pg_cron exists.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'gambit-maintenance';
    perform cron.schedule('gambit-maintenance', '* * * * *', 'select public.run_maintenance()');
  end if;
exception when others then
  raise notice 'pg_cron not scheduled: %', sqlerrm;
end $$;
