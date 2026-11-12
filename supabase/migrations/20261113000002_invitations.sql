create table public.social_preferences (
  player_id uuid primary key references public.player_profiles(id) on delete cascade,
  show_activity boolean not null default true,
  allow_friends boolean not null default false,
  allow_ranked boolean not null default false,
  presence_key uuid not null unique default gen_random_uuid()
);
create table public.room_invitations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chess_rooms(id) on delete cascade,
  sender uuid not null references public.player_profiles(id) on delete cascade,
  recipient uuid not null references public.player_profiles(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','accepted','declined','expired')),
  expires_at timestamptz not null,
  unique(room_id,recipient)
);
create index room_invitations_recipient on public.room_invitations(recipient,status);

create function public.social_settings(p_user uuid,p_settings jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  prefs public.social_preferences;
begin
  insert into public.social_preferences(player_id) values(p_user) on conflict do nothing;
  if p_settings is not null then
    if not public._rate_limit('social-settings:' || p_user,20,60) then return public._error('rate_limited'); end if;
    insert into public.social_preferences(player_id,show_activity,allow_friends,allow_ranked) values(p_user,(p_settings->>'show_activity')::boolean,
      (p_settings->>'allow_friends')::boolean,(p_settings->>'allow_ranked')::boolean)
    on conflict(player_id) do update set show_activity = excluded.show_activity,allow_friends = excluded.allow_friends,
      allow_ranked = excluded.allow_ranked,
      presence_key = case when public.social_preferences.show_activity and not excluded.show_activity
        then gen_random_uuid() else public.social_preferences.presence_key end;
    perform realtime.send('{}'::jsonb,'changed','notifications:' || p_user,true);
  end if;
  select * into prefs from public.social_preferences where player_id = p_user;
  return jsonb_build_object('ok',true,'presenceTopic',case when prefs.show_activity then 'activity:' || prefs.presence_key end,'settings',jsonb_build_object(
    'show_activity',coalesce(prefs.show_activity,true),'allow_friends',coalesce(prefs.allow_friends,false),
    'allow_ranked',coalesce(prefs.allow_ranked,false)));
end
$$;

create function public.invite_friend(p_user uuid,p_friend uuid,p_code text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  r public.chess_rooms;
  invitation uuid;
begin
  if not public._rate_limit('room-invite:' || p_user,20,60) then return public._error('rate_limited'); end if;
  if not public._are_friends(p_user,p_friend) then return public._error('not_found'); end if;
  select * into r from public.chess_rooms where code = upper(p_code) and host_id = p_user for update;
  if r.id is null or r.status <> 'waiting' or r.expires_at <= now() then return public._error('room_closed'); end if;
  insert into public.room_invitations(room_id,sender,recipient,expires_at)
    values(r.id,p_user,p_friend,r.expires_at) on conflict(room_id,recipient) do nothing returning id into invitation;
  if invitation is null then return public._error('invite_exists'); end if;
  perform public._notify(p_friend,'room_invite',r.host_name || ' invited you to a match.','/friends#invitation-' || invitation);
  return jsonb_build_object('ok',true);
end
$$;

create function public._expire_room_invites() returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient_id uuid;
begin
  for recipient_id in update public.room_invitations set status = 'expired'
    where room_id = new.id and status = 'pending' returning recipient
  loop
    perform public._notify(recipient_id,'invite_expired','A match invitation expired.','/friends');
  end loop;
  return new;
end
$$;
create trigger gambit_room_invite_expiration after update of status on public.chess_rooms
for each row when(old.status = 'waiting' and new.status <> 'waiting') execute function public._expire_room_invites();

create function public.reply_to_invite(p_user uuid,p_invite uuid,p_password text,p_accept boolean)
returns jsonb language plpgsql set search_path = '' as $$
declare
  r public.chess_rooms;
  i public.room_invitations;
  result jsonb;
  player_name text;
begin
  if not public._rate_limit('invite-reply:' || p_user,20,60) then return public._error('rate_limited'); end if;
  select room.* into r from public.chess_rooms room join public.room_invitations inv on inv.room_id = room.id
    where inv.id = p_invite and inv.recipient = p_user for update of room;
  if r.id is null then return public._error('not_found'); end if;
  select * into i from public.room_invitations where id = p_invite for update;
  if i.status <> 'pending' or i.expires_at <= now() or r.status <> 'waiting' or r.expires_at <= now()
    or not public._are_friends(i.sender,p_user) then return public._error('room_closed'); end if;
  if p_accept then
    -- Mark before join so the room-close trigger expires only other invitations.
    update public.room_invitations set status = 'accepted' where id = i.id;
    result := public.join_room(p_user,r.code,p_password);
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

create function public.room_preview(p_user uuid,p_code text)
returns jsonb language plpgsql set search_path = '' as $$
declare r public.chess_rooms;
begin
  if not public._rate_limit('room-preview:' || p_user,20,60) then return public._error('rate_limited'); end if;
  select * into r from public.chess_rooms where code = upper(p_code) and status = 'waiting' and expires_at > now();
  if r.id is null then return public._error('room_not_found'); end if;
  return jsonb_build_object('ok',true,'room',public._room_public(r));
end
$$;

alter table public.social_preferences enable row level security;
alter table public.room_invitations enable row level security;
revoke all on public.social_preferences,public.room_invitations from public,anon,authenticated;
grant select,insert,update on public.social_preferences,public.room_invitations to service_role;
revoke execute on function public.social_settings(uuid,jsonb),public.invite_friend(uuid,uuid,text),
  public._expire_room_invites(),public.reply_to_invite(uuid,uuid,text,boolean),public.room_preview(uuid,text)
  from public,anon,authenticated;
grant execute on function public.social_settings(uuid,jsonb),public.invite_friend(uuid,uuid,text),
  public.reply_to_invite(uuid,uuid,text,boolean),public.room_preview(uuid,text) to service_role;
