-- Fixed matchmaking lifetime and server-authoritative reconnect grace.
alter table public.chess_games
  add column if not exists presence_started_at timestamptz,
  add column if not exists white_reconnect_by timestamptz,
  add column if not exists black_reconnect_by timestamptz,
  add column if not exists paused_at timestamptz;

alter table public.chess_games drop constraint if exists chess_games_result_reason_check;
alter table public.chess_games add constraint chess_games_result_reason_check check (result_reason in (
  'checkmate', 'resignation', 'timeout', 'stalemate', 'threefold-repetition',
  'fifty-move-rule', 'insufficient-material', 'agreement', 'timeout-insufficient-material',
  'disconnect', 'mutual-disconnect'
));

-- Track scenes independently so leaving one tab never disconnects another.
create table if not exists public.game_scene_connections (
  game_id uuid not null references public.chess_games(id) on delete cascade,
  player_id uuid not null,
  scene_id uuid not null,
  online_until timestamptz not null,
  left_scene boolean not null default false,
  primary key (game_id, player_id, scene_id)
);
alter table public.game_scene_connections enable row level security;
revoke all on public.game_scene_connections from public, anon, authenticated;
grant select, insert, update, delete on public.game_scene_connections to service_role;


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
    and q.expires_at > clock_timestamp()
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
  values (p_user, p_initial, p_increment, clock_timestamp() + interval '30 seconds')
  on conflict (player_id) do update set
    created_at = case
      when q.expires_at > clock_timestamp() and q.initial_ms = excluded.initial_ms and q.increment_ms = excluded.increment_ms
      then q.created_at else now() end,
    initial_ms = excluded.initial_ms,
    increment_ms = excluded.increment_ms,
    expires_at = case
      when q.expires_at > clock_timestamp() and q.initial_ms = excluded.initial_ms and q.increment_ms = excluded.increment_ms
      then q.expires_at else excluded.expires_at end
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
  select active_game_id into v_active from public.player_profiles where id = p_user for update;
  delete from public.matchmaking_queue where player_id = p_user;
  if v_active is not null then
    return jsonb_build_object('ok', true, 'status', 'matched', 'gameId', v_active);
  end if;
  return jsonb_build_object('ok', true, 'status', 'idle');
end;
$$;

create or replace function public._remaining_ms(g public.chess_games)
returns integer
language sql
stable
set search_path = ''
as $$
  select greatest(0, (case when g.turn = 'w' then g.white_ms else g.black_ms end)
    - floor(extract(epoch from (coalesce(g.paused_at, now()) - g.turn_started_at)) * 1000)::int)
$$;

-- Called with the game row locked. A clean exit expires its lease immediately.
-- A crash or network loss expires the lease 12 seconds after the last heartbeat.
create or replace function public._sync_game_presence(g public.chess_games)
returns public.chess_games
language plpgsql
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_white timestamptz;
  v_black timestamptz;
  v_absent_since timestamptz;
  v_pause timestamptz := g.paused_at;
begin
  if g.presence_started_at is null or g.status <> 'active' then return g; end if;

  select max(online_until) filter (where player_id = g.white_id),
         max(online_until) filter (where player_id = g.black_id)
    into v_white, v_black from public.game_scene_connections where game_id = g.id;
  v_white := coalesce(v_white, g.presence_started_at + interval '12 seconds');
  v_black := coalesce(v_black, g.presence_started_at + interval '12 seconds');
  v_absent_since := least(v_white, v_black);

  if v_absent_since <= v_now then
    v_pause := coalesce(v_pause, greatest(g.turn_started_at, v_absent_since));
    -- An earlier chess-clock flag takes precedence over the disconnect.
    if g.paused_at is null and
       extract(epoch from (v_pause - g.turn_started_at)) * 1000 >=
         (case when g.turn = 'w' then g.white_ms else g.black_ms end) then
      return g;
    end if;
    if v_absent_since + interval '30 seconds' <= v_now then
      g.paused_at := v_pause;
      perform public._finish_game(g,
        case when v_white = v_black then 'draw' when v_white < v_black then 'black' else 'white' end,
        case when v_white = v_black then 'mutual-disconnect' else 'disconnect' end);
      select * into g from public.chess_games where id = g.id;
      return g;
    end if;
  else
    v_pause := null;
  end if;

  v_white := case when v_white <= v_now then v_white + interval '30 seconds' end;
  v_black := case when v_black <= v_now then v_black + interval '30 seconds' end;
  if (g.white_reconnect_by, g.black_reconnect_by, g.paused_at) is distinct from (v_white, v_black, v_pause) then
    update public.chess_games set
      white_reconnect_by = v_white, black_reconnect_by = v_black, paused_at = v_pause,
      turn_started_at = case when v_pause is null and g.paused_at is not null
        then g.turn_started_at + (v_now - g.paused_at) else g.turn_started_at end,
      version = version + 1
    where id = g.id returning * into g;
  end if;
  return g;
end;
$$;


create or replace function public._settle_if_flagged(g public.chess_games)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_winner text := case when g.turn = 'w' then 'b' else 'w' end;
begin
  if g.status <> 'active' then return false; end if;
  g := public._sync_game_presence(g);
  if g.status = 'finished' then return true; end if;
  if public._remaining_ms(g) > 0 then
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
    if (select result_reason from public.chess_games where id = p_game) in ('disconnect', 'mutual-disconnect') then
      return public._error('game_over');
    end if;
    return public._error('flagged');
  end if;
  select * into g from public.chess_games where id = p_game;
  if g.paused_at is not null then return public._error('game_paused'); end if;
  if g.version <> p_expected_version then return public._error('stale'); end if;
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
    select candidate.* from public.chess_games candidate
    where candidate.status = 'active'
      and (
        candidate.paused_at is not null
        or candidate.turn_started_at + make_interval(secs =>
          (case when candidate.turn = 'w' then candidate.white_ms else candidate.black_ms end) / 1000.0) <= now()
        or (
          candidate.presence_started_at + interval '12 seconds' <= now()
          and 2 > (
            select count(distinct c.player_id) from public.game_scene_connections c
            where c.game_id = candidate.id and c.online_until > now()
          )
        )
      )
    for update of candidate skip locked
  loop
    if public._settle_if_flagged(g) then
      v_settled := v_settled + 1;
    end if;
  end loop;

  delete from public.game_scene_connections c using public.chess_games finished
    where c.game_id = finished.id and finished.status = 'finished';

  update public.chess_rooms set status = 'expired' where status = 'waiting' and expires_at <= now();
  get diagnostics v_rooms = row_count;
  delete from public.matchmaking_queue where expires_at <= now();
  delete from public.rate_limits where window_start < now() - interval '1 hour';

  return jsonb_build_object('ok', true, 'settledGames', v_settled, 'expiredRooms', v_rooms);
end;
$$;

create or replace function public.update_game_scene(p_game uuid, p_user uuid, p_scene uuid, p_leaving boolean)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  g public.chess_games;
  v_now timestamptz;
begin
  select * into g from public.chess_games where id = p_game for update;
  if g.id is null or public._color_of(g, p_user) is null then
    return public._error('not_found');
  end if;
  if g.status = 'active' and not public._settle_if_flagged(g) then
    v_now := clock_timestamp();
    if g.presence_started_at is null then
      update public.chess_games set presence_started_at = v_now where id = p_game returning * into g;
    else
      select * into g from public.chess_games where id = p_game;
    end if;
    insert into public.game_scene_connections as c (game_id, player_id, scene_id, online_until, left_scene)
    values (p_game, p_user, p_scene, case when p_leaving then v_now else v_now + interval '12 seconds' end, p_leaving)
    on conflict (game_id, player_id, scene_id) do update
      set online_until = case when p_leaving then least(c.online_until, v_now) else excluded.online_until end,
          left_scene = excluded.left_scene
      where not c.left_scene;
    g := public._sync_game_presence(g);
  else
    select * into g from public.chess_games where id = p_game;
  end if;
  return jsonb_build_object('ok', true, 'game', to_jsonb(g), 'serverNow', clock_timestamp());
end;
$$;

revoke execute on function public._sync_game_presence(public.chess_games) from public, anon, authenticated;
revoke execute on function public.update_game_scene(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public._sync_game_presence(public.chess_games) to service_role;
grant execute on function public.update_game_scene(uuid, uuid, uuid, boolean) to service_role;
