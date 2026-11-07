-- Gambit accounts: unique usernames, profile creation on sign-up, player
-- statistics, and fixes to room and profile state found while debugging.
--
-- Additive and safe to re-run. Requires 20261107000000_online_play.sql.
-- Nothing here deletes users, games or rooms.

-- ---------------------------------------------------------------------------
-- Usernames
-- ---------------------------------------------------------------------------

create or replace function public.is_reserved_username(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(p_name) = any (array[
    'admin', 'administrator', 'root', 'system', 'sysadmin', 'gambit', 'support', 'help',
    'moderator', 'mod', 'staff', 'official', 'owner', 'superuser', 'security', 'null',
    'undefined', 'anonymous', 'guest', 'api', 'auth', 'login', 'logout', 'signup',
    'register', 'profile', 'settings', 'account', 'me', 'computer', 'bot', 'engine',
    'server', 'service', 'everyone', 'nobody', 'webmaster', 'postmaster', 'abuse', 'info'
  ])
$$;

-- 3–20 letters, digits or underscores, and not reserved. The database, not the
-- browser, is the final authority.
create or replace function public.is_valid_username(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select coalesce(p_name ~ '^[A-Za-z0-9_]{3,20}$' and not public.is_reserved_username(p_name), false) $$;

alter table public.player_profiles add column if not exists username text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'player_profiles_username_valid') then
    alter table public.player_profiles
      add constraint player_profiles_username_valid check (username is null or public.is_valid_username(username));
  end if;
end $$;

-- Case-insensitive uniqueness: "Sodiol" and "sodiol" are the same name.
create unique index if not exists player_profiles_username_key on public.player_profiles (lower(username));

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create or replace function public._guest_name()
returns text
language sql
volatile
set search_path = ''
as $$
  select (array['Swift', 'Quiet', 'Bold', 'Clever', 'Brave', 'Calm', 'Sharp', 'Lucky'])[1 + floor(random() * 8)::int]
    || (array['Knight', 'Bishop', 'Rook', 'Pawn', 'Queen', 'King'])[1 + floor(random() * 6)::int]
    || (10 + floor(random() * 90))::int
$$;

-- Creates the profile if missing, and releases an `active_game_id` that no
-- longer blocks anything: a finished game, or one whose clock has run out with
-- nobody watching. Without this a flagged, abandoned game kept the player out
-- of matchmaking and room creation until someone opened it. Lock order is
-- game, then profile, the same as submit_move.
create or replace function public._ensure_profile(p_user uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_active uuid;
  g public.chess_games;
begin
  insert into public.player_profiles (id, nickname) values (p_user, public._guest_name())
  on conflict (id) do nothing;

  select active_game_id into v_active from public.player_profiles where id = p_user;
  if v_active is null then
    return;
  end if;
  select * into g from public.chess_games where id = v_active for update;
  if g.id is null or g.status <> 'active' then
    update public.player_profiles set active_game_id = null where id = p_user and active_game_id = v_active;
  else
    perform public._settle_if_flagged(g);
  end if;
end;
$$;

-- Every new account gets a profile. The username chosen at sign-up arrives in
-- user metadata; a taken or invalid one aborts the sign-up, so two people
-- registering the same name at once can never both get it.
create or replace function public._handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'username', '')), '');
begin
  if v_username is null then
    perform public._ensure_profile(new.id);
    return new;
  end if;
  if not public.is_valid_username(v_username) then
    raise exception 'invalid_username' using errcode = '22023';
  end if;
  begin
    insert into public.player_profiles (id, nickname, username) values (new.id, v_username, v_username);
  exception when unique_violation then
    raise exception 'username_taken' using errcode = '23505';
  end;
  return new;
end;
$$;

drop trigger if exists gambit_on_auth_user_created on auth.users;
create trigger gambit_on_auth_user_created
  after insert on auth.users
  for each row execute function public._handle_new_user();

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
    'id', v.id, 'nickname', v.nickname, 'username', v.username,
    'activeGameId', v.active_game_id, 'createdAt', v.created_at
  ));
end;
$$;

-- `p_key` identifies the caller for rate limiting (user id or client address).
create or replace function public.username_available(p_username text, p_key text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_username, ''));
begin
  if not public._rate_limit('uname-check:' || coalesce(p_key, '?'), 40, 60) then
    return public._error('rate_limited');
  end if;
  if v_name !~ '^[A-Za-z0-9_]{3,20}$' then
    return jsonb_build_object('ok', true, 'available', false, 'reason', 'invalid_username');
  end if;
  if public.is_reserved_username(v_name) then
    return jsonb_build_object('ok', true, 'available', false, 'reason', 'username_reserved');
  end if;
  if exists (select 1 from public.player_profiles where lower(username) = lower(v_name)) then
    return jsonb_build_object('ok', true, 'available', false, 'reason', 'username_taken');
  end if;
  return jsonb_build_object('ok', true, 'available', true);
end;
$$;

-- Claims or changes a username. The unique index settles races; the display
-- nickname follows the username so new games and rooms show it. Names already
-- stored on past games are snapshots and stay as they were.
create or replace function public.set_username(p_user uuid, p_username text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_username, ''));
begin
  if not public._rate_limit('uname:' || p_user, 10, 60) then
    return public._error('rate_limited');
  end if;
  if v_name !~ '^[A-Za-z0-9_]{3,20}$' then
    return public._error('invalid_username');
  end if;
  if public.is_reserved_username(v_name) then
    return public._error('username_reserved');
  end if;
  perform public._ensure_profile(p_user);
  begin
    update public.player_profiles set username = v_name, nickname = v_name, updated_at = now()
      where id = p_user;
  exception when unique_violation then
    return public._error('username_taken');
  end;
  return public.get_profile(p_user);
end;
$$;

-- Results of finished online games, computed from the games themselves.
create or replace function public.get_player_stats(p_user uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with mine as (
    select g.*, case when g.white_id = p_user then 'w' else 'b' end as color
    from public.chess_games g
    where g.status = 'finished' and (g.white_id = p_user or g.black_id = p_user)
  )
  select jsonb_build_object(
    'ok', true,
    'stats', jsonb_build_object(
      'played', count(*),
      'wins', count(*) filter (where (result = 'white' and color = 'w') or (result = 'black' and color = 'b')),
      'losses', count(*) filter (where (result = 'white' and color = 'b') or (result = 'black' and color = 'w')),
      'draws', count(*) filter (where result = 'draw')
    ),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'color', r.color,
        'opponentName', case when r.color = 'w' then r.black_name else r.white_name end,
        'outcome', case
          when r.result = 'draw' then 'draw'
          when (r.result = 'white') = (r.color = 'w') then 'win'
          else 'loss' end,
        'reason', r.result_reason,
        'initialMs', r.initial_ms,
        'incrementMs', r.increment_ms,
        'endedAt', r.ended_at
      ) order by r.ended_at desc)
      from (select * from mine order by ended_at desc limit 20) r
    ), '[]'::jsonb)
  )
  from mine
$$;

-- ---------------------------------------------------------------------------
-- Rooms
-- ---------------------------------------------------------------------------

-- The host's open room, so a refreshed page can pick up where it left off.
create or replace function public.get_hosted_room(p_user uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_room public.chess_rooms;
begin
  select * into v_room from public.chess_rooms
    where host_id = p_user and status = 'waiting' and expires_at > now()
    order by created_at desc limit 1;
  return jsonb_build_object('ok', true, 'room', case when v_room.id is null then null else public._room_public(v_room) end);
end;
$$;

-- Previously a lapsed room still reported "waiting" to its host until
-- maintenance ran, so the host waited on a room nobody could join.
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
    update public.chess_rooms set status = 'expired'
      where code = upper(p_code) and host_id = p_user and status = 'waiting' and expires_at <= now();
    select * into v_room from public.chess_rooms where code = upper(p_code) and host_id = p_user;
  end if;
  if v_room.id is null then
    return public._error('room_not_found');
  end if;
  return jsonb_build_object('ok', true, 'room', public._room_public(v_room));
end;
$$;

-- Now reports what actually happened: a room that already started is returned
-- as started (with its game), so the client never discards a live game.
create or replace function public.cancel_room(p_user uuid, p_code text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_room public.chess_rooms;
begin
  update public.chess_rooms set status = 'cancelled'
    where code = upper(p_code) and host_id = p_user and status = 'waiting'
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

-- As before, with distinct errors for a malformed code and an expired room, and
-- a host's stale active game released before it is held against them.
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
    return public._error('invalid_room_code');
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
  if v_room.status = 'expired' or (v_room.status = 'waiting' and v_room.expires_at <= now()) then
    return public._error('room_expired');
  end if;
  if v_room.status <> 'waiting' then
    return public._error('room_closed');
  end if;
  if extensions.crypt(coalesce(p_password, ''), v_room.password_hash) <> v_room.password_hash then
    return public._error('wrong_password');
  end if;

  perform public._ensure_profile(v_room.host_id);

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

-- ---------------------------------------------------------------------------
-- Privileges: service_role only, as in the first migration.
-- ---------------------------------------------------------------------------

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'is_reserved_username', 'is_valid_username', '_guest_name', '_ensure_profile',
      '_handle_new_user', 'get_profile', 'username_available', 'set_username',
      'get_player_stats', 'get_hosted_room', 'room_heartbeat', 'cancel_room', 'join_room'
    )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
