create table public.friendships (
  low_id uuid not null references public.player_profiles(id) on delete cascade,
  high_id uuid not null references public.player_profiles(id) on delete cascade,
  requester uuid not null,
  status text not null check (status in ('pending','accepted','declined','cancelled')),
  updated_at timestamptz not null default now(),
  primary key(low_id, high_id),
  check(low_id < high_id and requester in (low_id,high_id))
);
create index friendships_high on public.friendships(high_id,status);
create table public.user_notifications (
  id bigint generated always as identity primary key,
  recipient uuid not null references public.player_profiles(id) on delete cascade,
  kind text not null,
  message text not null,
  href text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient on public.user_notifications(recipient,id desc);

create function public._notify(p_user uuid,p_kind text,p_message text,p_href text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.user_notifications(recipient,kind,message,href) values(p_user,p_kind,p_message,p_href);
  perform realtime.send('{}'::jsonb,'changed','notifications:' || p_user,true);
end
$$;

create function public._are_friends(a uuid,b uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists(select 1 from public.friendships where low_id = least(a,b) and high_id = greatest(a,b) and status = 'accepted')
$$;

create function public.friend_action(p_user uuid,p_other uuid,p_action text)
returns jsonb language plpgsql set search_path = '' as $$
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
  end if;
  return jsonb_build_object('ok',true,'status',next_status);
end
$$;

create function public.get_notifications(p_user uuid,p_read bigint default null)
returns jsonb language plpgsql set search_path = '' as $$
begin
  if not public._rate_limit('notifications:' || p_user,60,60) then return public._error('rate_limited'); end if;
  if p_read is not null then
    update public.user_notifications set read_at = now()
    where recipient = p_user and read_at is null and (p_read = 0 or id = p_read);
  end if;
  return jsonb_build_object('ok',true,'unread',
    (select count(*) from public.user_notifications where recipient = p_user and read_at is null),
    'items',coalesce((select jsonb_agg(to_jsonb(n) - 'recipient' order by n.id desc) from (
      select * from public.user_notifications where recipient = p_user order by id desc limit 30
    ) n),'[]'::jsonb));
end
$$;

create function public._notify_rating_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public._notify(new.player_id,'rating',format('Ranked result: %s%s points. Your rating is %s.',
    case when new.rating_change > 0 then '+' else '' end,new.rating_change,new.rating_after),'/game/' || new.game_id);
  return new;
end
$$;
create trigger gambit_rating_notification after insert on public.rating_transactions
for each row execute function public._notify_rating_change();

create function public._ranked_players()
returns table(player_id uuid, username text, country_code text, rating integer, peak integer,
  wins integer, losses integer, draws integer, tier text, world_rank bigint, country_rank bigint)
language sql stable set search_path = '' as $$
  select r.player_id,p.username,p.country_code,r.rating,r.peak,r.wins,r.losses,r.draws,public.rank_tier(r.rating),
    row_number() over(order by r.rating desc,r.wins desc,r.player_id),
    case when p.country_code is not null then row_number() over(partition by p.country_code order by r.rating desc,r.wins desc,r.player_id) end
  from public.player_ratings r join public.player_profiles p on p.id = r.player_id
  where p.username is not null and r.wins + r.losses + r.draws > 0
$$;

create function public.public_player(p_username text)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('ok',true,'profile',jsonb_build_object(
    'player_id',p.id,'username',p.username,'country_code',p.country_code,'rating',r.rating,'peak',r.peak,
    'wins',r.wins,'losses',r.losses,'draws',r.draws,'tier',public.rank_tier(r.rating),
    'world_rank',leader.world_rank,'country_rank',leader.country_rank,'joined_at',p.created_at),
    'matches',coalesce((select jsonb_agg(to_jsonb(m) order by m.ended_at desc) from (
      select case when g.white_id = p.id then g.black_name else g.white_name end as opponent,
        case when g.result = 'draw' then 'draw' when (g.result = 'white') = (g.white_id = p.id) then 'win' else 'loss' end as outcome,
        g.initial_ms,g.increment_ms,g.ended_at,g.ranked
      from public.chess_games g where g.status = 'finished' and g.origin = 'matchmaking'
        and p.id in (g.white_id,g.black_id) order by g.ended_at desc limit 12
    ) m),'[]'::jsonb))
  from public.player_profiles p join public.player_ratings r on r.player_id = p.id
  left join public._ranked_players() leader on leader.player_id = p.id where lower(p.username) = lower(p_username)
$$;

create function public.leaderboard(p_user uuid,p_scope text,p_country text,p_search text,p_offset integer)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  rows jsonb;
  current_player jsonb;
  friend_position bigint;
begin
  if p_scope not in ('world','country','friends') or p_offset not between 0 and 100000 then return public._error('invalid_request'); end if;
  if p_scope = 'friends' and p_user is null then return public._error('unauthorized'); end if;
  with ranked as (
    select rp.*, row_number() over(order by rp.rating desc,rp.wins desc,rp.player_id) as position
    from public._ranked_players() rp
    where p_scope = 'world' or (p_scope = 'country' and rp.country_code = p_country)
      or (p_scope = 'friends' and (rp.player_id = p_user or public._are_friends(p_user,rp.player_id)))
  ), page as (
    select * from ranked where strpos(lower(username),lower(coalesce(p_search,''))) > 0 or coalesce(p_search,'') = ''
    order by position limit 26 offset p_offset
  )
  select coalesce(jsonb_agg(to_jsonb(page) order by position),'[]'::jsonb) into rows from page;

  if p_user is not null then
    select count(*) + 1 into friend_position
    from public.player_ratings other join public.player_ratings own on own.player_id = p_user
    where other.wins + other.losses + other.draws > 0 and public._are_friends(p_user,other.player_id)
      and (other.rating > own.rating or (other.rating = own.rating and (other.wins > own.wins
        or (other.wins = own.wins and other.player_id < own.player_id))));
    select jsonb_build_object('rating',r.rating,'country_code',p.country_code,
      'world_rank',ranked.world_rank,'country_rank',ranked.country_rank,
      'friends_rank',case when ranked.world_rank is not null then friend_position end,
      'has_friends',exists(select 1 from public.friendships f where f.status = 'accepted' and p_user in (f.low_id,f.high_id)))
    into current_player
    from public.player_ratings r join public.player_profiles p on p.id = r.player_id
    left join public._ranked_players() ranked on ranked.player_id = r.player_id
    where r.player_id = p_user;
  end if;
  return jsonb_build_object('ok',true,'rows',rows,'me',current_player);
end
$$;

create function public.set_country(p_user uuid,p_country text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  current_profile public.player_profiles;
begin
  if p_country is not null and p_country <> all(string_to_array('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW',' ')) then
    return public._error('invalid_country');
  end if;
  select * into current_profile from public.player_profiles where id = p_user for update;
  if current_profile.id is null then return public._error('not_found'); end if;
  if current_profile.country_code is distinct from p_country then
    if current_profile.country_changed_at > now() - interval '30 days' then return public._error('country_cooldown'); end if;
    update public.player_profiles set country_code = p_country,country_changed_at = now() where id = p_user;
  end if;
  return jsonb_build_object('ok',true,'country',p_country);
end
$$;

alter table public.friendships enable row level security;
alter table public.user_notifications enable row level security;
revoke all on public.friendships,public.user_notifications from public,anon,authenticated;
grant select,insert,update on public.friendships,public.user_notifications to service_role;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('_notify','_are_friends','friend_action','get_notifications',
      '_notify_rating_change','_ranked_players','public_player','leaderboard','set_country')
  loop
    execute format('revoke execute on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end
$$;

create policy "gambit: receive personal notifications" on realtime.messages for select to authenticated
using (extension = 'broadcast' and realtime.topic() = 'notifications:' || auth.uid()::text);
