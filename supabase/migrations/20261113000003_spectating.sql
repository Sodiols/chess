create table public.spectator_sessions (
  id uuid primary key,
  host_id uuid not null references public.player_profiles(id) on delete cascade,
  game_id uuid unique references public.chess_games(id) on delete cascade,
  kind text not null check(kind in ('online','computer','local')),
  snapshot jsonb,
  sequence integer not null default 0,
  created_at timestamptz not null default now(),
  last_activity timestamptz not null default now(),
  ended_at timestamptz,
  check((kind = 'online') = (game_id is not null))
);
create index spectator_sessions_host on public.spectator_sessions(host_id,last_activity desc);
create table public.spectator_authorizations (
  session_id uuid not null references public.spectator_sessions(id) on delete cascade,
  viewer_id uuid not null references public.player_profiles(id) on delete cascade,
  expires_at timestamptz not null,
  last_viewed timestamptz not null default now(),
  primary key(session_id,viewer_id)
);
create table public.player_activity (
  player_id uuid not null references public.player_profiles(id) on delete cascade,
  tab_id uuid not null,
  activity text not null check(activity in ('online','computer','local','spectating')),
  expires_at timestamptz not null,
  primary key(player_id,tab_id)
);

create function public._may_watch(p_user uuid,p_session public.spectator_sessions)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  g public.chess_games;
  r public.chess_rooms;
begin
  if p_user is null or p_session.id is null or p_session.ended_at is not null then return false; end if;
  if p_session.kind <> 'online' then
    return public._are_friends(p_user,p_session.host_id)
      and coalesce((select allow_friends from public.social_preferences where player_id = p_session.host_id),false);
  end if;
  select * into g from public.chess_games where id = p_session.game_id;
  if g.id is null or p_user in (g.white_id,g.black_id) then return false; end if;
  if g.ranked and (select count(*) from public.social_preferences
      where player_id in (g.white_id,g.black_id) and allow_ranked) <> 2 then return false; end if;
  if g.room_id is not null then
    select * into r from public.chess_rooms where id = g.room_id;
    return coalesce(r.allow_spectators,false) and public._are_friends(p_user,r.host_id)
      and (select count(*) from public.social_preferences where player_id in (g.white_id,g.black_id) and allow_friends) = 2;
  end if;
  return (public._are_friends(p_user,g.white_id) or public._are_friends(p_user,g.black_id))
    and (select count(*) from public.social_preferences where player_id in (g.white_id,g.black_id) and allow_friends) = 2;
end
$$;

create function public.authorize_spectator(p_user uuid,p_session uuid,p_password text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.spectator_sessions;
  g public.chess_games;
  r public.chess_rooms;
begin
  if not public._rate_limit('watch-auth:' || p_user,12,60) then return public._error('rate_limited'); end if;
  select * into s from public.spectator_sessions where id = p_session;
  if s.id is null then
    select * into g from public.chess_games where id = p_session and status = 'active';
    if g.id is null then return public._error('watch_unavailable'); end if;
    s.id := g.id; s.host_id := g.white_id; s.game_id := g.id; s.kind := 'online';
  end if;
  if not public._may_watch(p_user,s) then return public._error('watch_unavailable'); end if;
  if s.kind = 'online' then
    select * into g from public.chess_games where id = s.game_id and status = 'active';
    if g.id is null then return public._error('watch_unavailable'); end if;
    if g.room_id is not null then
      select * into r from public.chess_rooms where id = g.room_id;
      if p_password is null then return public._error('spectator_password_required'); end if;
      if extensions.crypt(p_password,r.password_hash) is distinct from r.password_hash then return public._error('wrong_password'); end if;
    end if;
    insert into public.spectator_sessions(id,host_id,game_id,kind)
    values(s.id,s.host_id,s.game_id,s.kind) on conflict(id) do nothing;
  elsif s.last_activity <= now() - interval '25 seconds' then
    return public._error('stream_disconnected');
  end if;
  insert into public.spectator_authorizations(session_id,viewer_id,expires_at)
    values(s.id,p_user,now() + interval '2 minutes')
    on conflict(session_id,viewer_id) do update set expires_at = excluded.expires_at,last_viewed = now();
  return jsonb_build_object('ok',true);
end
$$;

create function public.get_spectator_state(p_user uuid,p_session uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.spectator_sessions;
  g public.chess_games;
  data jsonb;
begin
  if not public._rate_limit('watch-read:' || p_user,180,60) then return public._error('rate_limited'); end if;
  select * into s from public.spectator_sessions where id = p_session;
  if not public._may_watch(p_user,s) then return public._error('watch_unavailable'); end if;
  update public.spectator_authorizations set last_viewed = now(),expires_at = now() + interval '2 minutes'
    where session_id = p_session and viewer_id = p_user and expires_at > now();
  if not found then return public._error('watch_authorization_required'); end if;
  if s.kind = 'online' then
    select * into g from public.chess_games where id = s.game_id;
    -- Explicit projection: no identities, room credentials, or internal account state.
    data := jsonb_build_object('white',g.white_name,'black',g.black_name,'fen',g.fen,'turn',g.turn,
      'whiteRating',g.white_rating_before,'blackRating',g.black_rating_before,
      'whiteMs',g.white_ms,'blackMs',g.black_ms,'turnStarted',g.turn_started_at,'pausedAt',g.paused_at,
      'status',g.status,'result',g.result,'reason',g.result_reason,'sequence',g.version,
      'moves',coalesce((select jsonb_agg(jsonb_build_object('from',m.from_sq,'to',m.to_sq,'promotion',m.promotion) order by m.ply)
        from public.chess_moves m where m.game_id = g.id),'[]'::jsonb));
  else
    data := s.snapshot || jsonb_build_object('sequence',s.sequence,
      'disconnected',s.last_activity <= now() - interval '25 seconds');
  end if;
  return jsonb_build_object('ok',true,'kind',s.kind,'board',data,'serverNow',clock_timestamp(),
    'viewers',(select count(*) from public.spectator_authorizations
      where session_id = s.id and expires_at > now() and last_viewed > now() - interval '15 seconds'));
end
$$;

create function public.publish_spectator(p_user uuid,p_session uuid,p_kind text,p_sequence integer,p_board jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.spectator_sessions;
begin
  if not public._rate_limit('watch-publish:' || p_user,120,60) then return public._error('rate_limited'); end if;
  if p_kind not in ('computer','local') or not coalesce((select allow_friends from public.social_preferences where player_id = p_user),false) then
    return public._error('watch_sharing_disabled');
  end if;
  if p_session is null then
    if not public._rate_limit('watch-create:' || p_user,6,60) then return public._error('rate_limited'); end if;
    insert into public.spectator_sessions(id,host_id,kind,snapshot,sequence)
      values(gen_random_uuid(),p_user,p_kind,p_board,p_sequence) returning * into s;
  else
    update public.spectator_sessions set snapshot = case when p_sequence > sequence then p_board else snapshot end,
      sequence = greatest(sequence,p_sequence),last_activity = now()
    where id = p_session and host_id = p_user and kind = p_kind and ended_at is null
    returning * into s;
    if s.id is null then return public._error('watch_unavailable'); end if;
    if p_sequence = s.sequence then perform realtime.send('{}'::jsonb,'board_changed','watch:' || s.id,true); end if;
  end if;
  return jsonb_build_object('ok',true,'sessionId',s.id);
end
$$;

create function public.stop_spectator(p_user uuid,p_session uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  update public.spectator_sessions set ended_at = now()
    where id = p_session and host_id = p_user and kind in ('computer','local') and ended_at is null;
  if found then perform realtime.send('{}'::jsonb,'board_changed','watch:' || p_session,true); end if;
  return jsonb_build_object('ok',true);
end
$$;

create function public.signal_spectators() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.version <> old.version and exists(select 1 from public.spectator_sessions where id = new.id) then
    perform realtime.send('{}'::jsonb,'board_changed','watch:' || new.id,true);
  end if;
  return new;
end
$$;
create trigger gambit_spectator_signal after update of version on public.chess_games
for each row execute function public.signal_spectators();

create function public.set_room_spectators(p_user uuid,p_game uuid,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  update public.chess_rooms set allow_spectators = p_enabled where host_id = p_user and game_id = p_game;
  if not found then return public._error('not_found'); end if;
  if not p_enabled then
    delete from public.spectator_authorizations where session_id = p_game;
    perform realtime.send('{}'::jsonb,'board_changed','watch:' || p_game,true);
  end if;
  return jsonb_build_object('ok',true);
end
$$;

create function public.update_player_activity(p_user uuid,p_tab uuid,p_activity text)
returns jsonb language plpgsql set search_path = '' as $$
begin
  if not public._rate_limit('activity:' || p_user,60,60) then return public._error('rate_limited'); end if;
  if p_activity is null then
    delete from public.player_activity where player_id = p_user and tab_id = p_tab;
  else
    insert into public.player_activity values(p_user,p_tab,p_activity,now() + interval '30 seconds')
    on conflict(player_id,tab_id) do update set activity = excluded.activity,expires_at = excluded.expires_at;
  end if;
  return jsonb_build_object('ok',true);
end
$$;

create function public._friend_activity(p_user uuid,p_friend uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  g public.chess_games;
  s public.spectator_sessions;
  activity text;
  topic text;
begin
  if not public._are_friends(p_user,p_friend)
    or not coalesce((select show_activity from public.social_preferences where player_id = p_friend),true) then return null; end if;
  select 'activity:' || p.presence_key into topic from public.social_preferences p
    where player_id = p_friend and show_activity;
  select game.* into g from public.player_profiles p join public.chess_games game on game.id = p.active_game_id
    where p.id = p_friend and game.status = 'active' and exists(select 1 from public.game_scene_connections c
      where c.game_id = game.id and c.player_id = p_friend and not c.left_scene and c.online_until > now());
  if g.id is not null then
    s.id := g.id; s.host_id := g.white_id; s.game_id := g.id; s.kind := 'online';
    return jsonb_build_object('activity','online-game','topic',topic,'watch',case when public._may_watch(p_user,s) then g.id end);
  end if;
  select * into s from public.spectator_sessions
    where host_id = p_friend and kind <> 'online' and ended_at is null and snapshot->>'status' = 'active' and last_activity > now() - interval '25 seconds'
    order by last_activity desc limit 1;
  if s.id is not null and public._may_watch(p_user,s) then return jsonb_build_object('activity',s.kind,'topic',topic,'watch',s.id); end if;
  select a.activity into activity from public.player_activity a where a.player_id = p_friend and expires_at > now()
    order by (a.activity <> 'online') desc,expires_at desc limit 1;
  return jsonb_build_object('activity',coalesce(activity,'offline'),'topic',topic);
end
$$;

create function public.get_friends(p_user uuid,p_search text,p_offset integer default 0)
returns jsonb language plpgsql set search_path = '' as $$
declare people jsonb;
begin
  if not public._rate_limit('friends-list:' || p_user,60,60) then return public._error('rate_limited'); end if;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.username),'[]'::jsonb) into people from (
    select p.id as player_id,p.username,p.country_code,r.rating,public.rank_tier(r.rating) as tier,
      f.status,f.requester,case when f.status = 'accepted' then public._friend_activity(p_user,p.id) end as presence
    from public.player_profiles p join public.player_ratings r on p.id = r.player_id
    left join public.friendships f on f.low_id = least(p.id,p_user) and f.high_id = greatest(p.id,p_user)
    where p.id <> p_user and (case when coalesce(p_search,'') = '' then f.status in ('accepted','pending')
      else strpos(lower(p.username),lower(p_search)) > 0 end)
    order by p.username limit 31 offset greatest(0,p_offset)
  ) a;
  return jsonb_build_object('ok',true,'people',people,'invites',coalesce((
    select jsonb_agg(to_jsonb(i)) from (
      select inv.id,r.host_name,r.name,r.initial_ms,r.increment_ms,r.ranked,inv.expires_at
      from public.room_invitations inv join public.chess_rooms r on r.id = inv.room_id
      where inv.recipient = p_user and inv.status = 'pending' and r.status = 'waiting'
        and least(inv.expires_at,r.expires_at) > now() and public._are_friends(p_user,inv.sender)
      order by inv.expires_at limit 30
    ) i),'[]'::jsonb));
end
$$;

create function public.friend_details(p_user uuid,p_other uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('ok',true,'status',f.status,'requester',f.requester,
    'presence',public._friend_activity(p_user,p_other))
  from (select 1) one left join public.friendships f
    on f.low_id = least(p_user,p_other) and f.high_id = greatest(p_user,p_other)
$$;

create function public.can_receive_social_topic(p_topic text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  viewer uuid := auth.uid();
  subject uuid;
begin
  if viewer is null or p_topic !~ '^(watch|activity):[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then return false; end if;
  subject := split_part(p_topic,':',2)::uuid;
  if p_topic like 'activity:%' then
    return exists(select 1 from public.social_preferences p where p.presence_key = subject and p.show_activity
      and (p.player_id = viewer or public._are_friends(viewer,p.player_id)));
  end if;
  return exists(select 1 from public.spectator_authorizations a join public.spectator_sessions s on s.id = a.session_id
    where a.session_id = subject and a.viewer_id = viewer and a.expires_at > now() and public._may_watch(viewer,s));
end
$$;

create policy "gambit: receive authorised social topics" on realtime.messages for select to authenticated
using (extension = case when realtime.topic() like 'activity:%' then 'presence' else 'broadcast' end
  and public.can_receive_social_topic(realtime.topic()));
create function public.can_publish_social_presence(p_topic text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.social_preferences where player_id = auth.uid() and show_activity
    and p_topic = 'activity:' || presence_key::text)
$$;
create policy "gambit: track own activity" on realtime.messages for insert to authenticated
with check (extension = 'presence' and public.can_publish_social_presence(realtime.topic()));

-- Realtime caches authorization on channel join. Rotate both topics when a friendship ends.
create function public.rotate_friend_presence() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.social_preferences set presence_key = gen_random_uuid() where player_id in (new.low_id,new.high_id);
  perform realtime.send('{}'::jsonb,'changed','notifications:' || new.low_id,true);
  perform realtime.send('{}'::jsonb,'changed','notifications:' || new.high_id,true);
  return new;
end
$$;
create trigger gambit_revoke_friend_presence after update of status on public.friendships
for each row when(old.status = 'accepted' and new.status <> 'accepted') execute function public.rotate_friend_presence();

create function public.cleanup_social()
returns void language sql security definer set search_path = '' as $$
  with expired as (
    update public.room_invitations set status = 'expired' where status = 'pending' and expires_at <= now()
    returning recipient
  )
  select public._notify(recipient,'invite_expired','A match invitation expired.','/friends') from expired;
  delete from public.player_activity where expires_at < now();
  delete from public.spectator_authorizations where expires_at < now();
  delete from public.spectator_sessions where (kind <> 'online' and last_activity < now() - interval '15 minutes')
    or (kind = 'online' and exists (select 1 from public.chess_games g where g.id = game_id and g.ended_at < now() - interval '15 minutes'));
$$;
create function public._maintain_social() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.cleanup_social();
  return null;
end
$$;
-- Reuse the existing cron/maintenance route, which always deletes expired rate-limit rows.
create trigger gambit_maintain_social after delete on public.rate_limits for each statement
execute function public._maintain_social();

alter table public.spectator_sessions enable row level security;
alter table public.spectator_authorizations enable row level security;
alter table public.player_activity enable row level security;
revoke all on public.spectator_sessions,public.spectator_authorizations,public.player_activity from public,anon,authenticated;
grant select,insert,update,delete on public.spectator_sessions,public.spectator_authorizations,public.player_activity to service_role;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('_may_watch','authorize_spectator','get_spectator_state',
      'publish_spectator','stop_spectator','signal_spectators','set_room_spectators','update_player_activity',
      '_friend_activity','get_friends','friend_details','can_receive_social_topic','can_publish_social_presence',
      'rotate_friend_presence','cleanup_social','_maintain_social')
  loop
    execute format('revoke execute on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end
$$;
grant execute on function public.can_receive_social_topic(text),public.can_publish_social_presence(text) to authenticated;
