-- Give non-move game events a monotonically increasing revision too.
-- Heartbeats and canonical snapshots can then recover draw/rematch changes.
create function public._version_game_metadata()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  return new;
end
$$;

create trigger gambit_game_metadata_version
before update on public.chess_games for each row
when (old.version = new.version and (
  old.draw_offered_by is distinct from new.draw_offered_by
  or old.rematch_requested_by is distinct from new.rematch_requested_by
  or old.rematch_game_id is distinct from new.rematch_game_id
))
execute function public._version_game_metadata();

revoke execute on function public._version_game_metadata() from public, anon, authenticated;

create function public._join_room(p_user uuid, p_code text, p_password text, p_count_limit boolean)
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
  if p_count_limit and not public._rate_limit('room-join:' || p_user, 10, 60) then
    return public._error('rate_limited');
  end if;
  if coalesce(p_code, '') !~* '^[A-HJ-NP-Z2-9]{6}$' then
    return public._error('invalid_room_code');
  end if;

  select * into v_room from public.chess_rooms where code = upper(p_code);
  if v_room.id is null then return public._error('room_not_found'); end if;
  if v_room.host_id = p_user then return public._error('own_room'); end if;

  -- Game creation takes profile locks before touching waiting rooms.
  perform public._ensure_profile(least(p_user, v_room.host_id));
  perform public._ensure_profile(greatest(p_user, v_room.host_id));
  perform 1 from public.player_profiles where id in (p_user, v_room.host_id)
    order by id for no key update;
  select * into v_room from public.chess_rooms where id = v_room.id for update;
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

  select * into v_host from public.player_profiles where id = v_room.host_id;
  select * into v_guest from public.player_profiles where id = p_user;
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

revoke execute on function public._join_room(uuid,text,text,boolean) from public, anon, authenticated;
grant execute on function public._join_room(uuid,text,text,boolean) to service_role;

create or replace function public.join_room(p_user uuid,p_code text,p_password text)
returns jsonb language sql set search_path = '' as $$
  select public._join_room(p_user,p_code,p_password,true)
$$;

create or replace function public.reply_to_invite(p_user uuid,p_invite uuid,p_password text,p_accept boolean)
returns jsonb language plpgsql set search_path = '' as $$
declare
  r public.chess_rooms;
  i public.room_invitations;
  result jsonb;
  player_name text;
begin
  if not public._rate_limit('invite-reply:' || p_user,20,60) then return public._error('rate_limited'); end if;
  if p_accept and not public._rate_limit('room-join:' || p_user,10,60) then return public._error('rate_limited'); end if;
  select room.* into r from public.chess_rooms room join public.room_invitations inv on inv.room_id = room.id
    where inv.id = p_invite and inv.recipient = p_user;
  if r.id is null then return public._error('not_found'); end if;
  if p_accept then
    perform public._ensure_profile(least(p_user, r.host_id));
    perform public._ensure_profile(greatest(p_user, r.host_id));
    perform 1 from public.player_profiles where id in (p_user, r.host_id)
      order by id for no key update;
  end if;
  select * into r from public.chess_rooms where id = r.id for update;
  if r.id is null then return public._error('not_found'); end if;
  select * into i from public.room_invitations where id = p_invite for update;
  if p_accept and i.status = 'accepted' and r.guest_id = p_user and r.game_id is not null then
    return jsonb_build_object('ok',true,'gameId',r.game_id);
  end if;
  if i.status <> 'pending' or i.expires_at <= now() or r.status <> 'waiting' or r.expires_at <= now()
    or not public._are_friends(i.sender,p_user) then return public._error('room_closed'); end if;
  if p_accept then
    -- Mark before join so the room-close trigger expires only other invitations.
    update public.room_invitations set status = 'accepted' where id = i.id;
    result := public._join_room(p_user,r.code,p_password,false);
    if not (result->>'ok')::boolean then
      update public.room_invitations set status = 'pending' where id = i.id;
      return result;
    end if;
  else
    update public.room_invitations set status = 'declined' where id = i.id;
    result := jsonb_build_object('ok',true);
  end if;
  select username into player_name from public.player_profiles where id = p_user;
  perform public._notify(i.sender,case when p_accept then 'invite_accepted' else 'invite_declined' end,
    player_name || case when p_accept then ' accepted your match invitation.' else ' declined your match invitation.' end,
    case when p_accept then '/game/' || (result->>'gameId') else '/friends' end);
  return result;
end
$$;

create or replace function public.authorize_spectator(p_user uuid,p_session uuid,p_password text)
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
  if s.kind = 'online' then
    select * into g from public.chess_games where id = s.game_id and status = 'active';
    if g.id is null then return public._error('watch_unavailable'); end if;
    if g.room_id is not null then
      -- Serialize against host revocation so an in-flight grant cannot survive it.
      select * into r from public.chess_rooms where id = g.room_id for share;
    end if;
    if not public._may_watch(p_user,s) then return public._error('watch_unavailable'); end if;
    if g.room_id is not null then
      if p_password is null then return public._error('spectator_password_required'); end if;
      if extensions.crypt(p_password,r.password_hash) is distinct from r.password_hash then return public._error('wrong_password'); end if;
    end if;
    insert into public.spectator_sessions(id,host_id,game_id,kind)
    values(s.id,s.host_id,s.game_id,s.kind) on conflict(id) do nothing;
  elsif not public._may_watch(p_user,s) then
    return public._error('watch_unavailable');
  elsif s.last_activity <= now() - interval '25 seconds' then
    return public._error('stream_disconnected');
  end if;
  insert into public.spectator_authorizations(session_id,viewer_id,expires_at)
    values(s.id,p_user,now() + interval '2 minutes')
    on conflict(session_id,viewer_id) do update set expires_at = excluded.expires_at,last_viewed = now();
  return jsonb_build_object('ok',true);
end
$$;

create or replace function public.friend_action(p_user uuid,p_other uuid,p_action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  lo uuid := least(p_user,p_other);
  hi uuid := greatest(p_user,p_other);
  relation public.friendships;
  next_status text;
  next_requester uuid;
  sender text;
begin
  if not public._rate_limit('friend:' || p_user,30,60) then return public._error('rate_limited'); end if;
  if p_other is null or p_user = p_other or not exists(select 1 from public.player_ratings where player_id = p_other)
    or not exists(select 1 from public.player_ratings where player_id = p_user) then return public._error('not_found'); end if;
  perform pg_advisory_xact_lock(hashtextextended(lo::text || hi::text,18));
  select * into relation from public.friendships where low_id = lo and high_id = hi for update;
  next_requester := coalesce(relation.requester,p_user);
  if p_action = 'request' then
    if relation.status = 'accepted' or relation.status = 'pending' then return public._error('friend_request_exists'); end if;
    if relation.updated_at > now() - interval '60 seconds' then return public._error('try_again'); end if;
    next_status := 'pending';
    next_requester := p_user;
  elsif p_action in ('accept','decline') and relation.status = 'pending' and relation.requester <> p_user then
    next_status := case when p_action = 'accept' then 'accepted' else 'declined' end;
  elsif (p_action = 'cancel' and relation.status = 'pending' and relation.requester = p_user)
     or (p_action = 'remove' and relation.status = 'accepted') then
    next_status := 'cancelled';
  else
    return public._error('friend_action_unavailable');
  end if;
  insert into public.friendships values(lo,hi,next_requester,next_status,now())
  on conflict(low_id,high_id) do update set requester = excluded.requester,status = excluded.status,updated_at = excluded.updated_at;
  select username into sender from public.player_profiles where id = p_user;
  if next_status = 'pending' then
    perform public._notify(p_other,'friend_request',sender || ' sent you a friend request.','/friends');
  elsif next_status = 'accepted' then
    perform public._notify(p_other,'friend_accepted',sender || ' accepted your friend request.','/friends');
  elsif p_action in ('decline','cancel') then
    perform realtime.send('{}'::jsonb,'changed','notifications:' || p_other,true);
  end if;
  return jsonb_build_object('ok',true,'status',next_status);
end
$$;
