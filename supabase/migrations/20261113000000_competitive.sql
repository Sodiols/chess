-- Competitive data is written only by authoritative game settlement.
alter table public.player_profiles
  add column country_code text,
  add column country_changed_at timestamptz;
alter table public.chess_rooms
  add column ranked boolean not null default false,
  add column allow_spectators boolean not null default false;
alter table public.chess_rooms alter column ranked set default true;
alter table public.chess_games
  add column ranked boolean not null default false,
  add column white_rating_before integer,
  add column black_rating_before integer,
  add column rating_exclusion text;

create table public.player_ratings (
  player_id uuid primary key references public.player_profiles(id) on delete cascade,
  rating integer not null default 1000 check (rating >= 0),
  peak integer not null default 1000 check (peak >= rating),
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0
);
create index player_ratings_order on public.player_ratings(rating desc, wins desc, player_id);
create index player_profiles_country on public.player_profiles(country_code) where username is not null;

create table public.rating_transactions (
  game_id uuid not null references public.chess_games(id) on delete cascade,
  player_id uuid not null references public.player_profiles(id) on delete cascade,
  rating_before integer not null,
  rating_change integer not null,
  rating_after integer not null,
  opponent_before integer not null,
  outcome text not null check (outcome in ('win','draw','loss')),
  rank_before text not null,
  rank_after text not null,
  created_at timestamptz not null,
  primary key(game_id, player_id)
);
create index rating_transactions_recent on public.rating_transactions(player_id, created_at desc);
create index chess_ranked_private_pair on public.chess_games(
  least(white_id, black_id), greatest(white_id, black_id), ended_at desc
) where ranked and room_id is not null and status = 'finished';

create function public.rank_tier(p_rating integer)
returns text language sql immutable set search_path = '' as $$
  select case when p_rating < 1000 then 'Bronze' when p_rating < 1400 then 'Silver'
    when p_rating < 1800 then 'Gold' when p_rating < 2100 then 'Platinum'
    when p_rating < 2400 then 'Diamond' else 'Master' end
$$;

-- Each full 100 points of opponent advantage adds one point, capped at six.
-- Add the same signed adjustment to wins and losses. Draws use their tier base.
create function public.rating_delta(p_rating integer, p_opponent integer, p_outcome text)
returns integer language sql immutable set search_path = '' as $$
  select case p_outcome
    when 'draw' then (array[4,2,0,0,0,0])[tier]
    when 'win' then (array[26,20,16,13,10,7])[tier] + adjustment
    when 'loss' then (array[-8,-10,-13,-16,-20,-24])[tier] + adjustment
  end
  from (select array_position(array['Bronze','Silver','Gold','Platinum','Diamond','Master'],
    public.rank_tier(p_rating)) as tier, greatest(-6, least(6, (p_opponent - p_rating) / 100)) as adjustment) b
$$;

create function public._initialize_rating() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.username is not null then
    insert into public.player_ratings(player_id) values(new.id) on conflict do nothing;
  end if;
  return new;
end
$$;
create trigger gambit_profile_rating after insert or update of username on public.player_profiles
for each row execute function public._initialize_rating();
insert into public.player_ratings(player_id) select id from public.player_profiles where username is not null;

create function public._snapshot_game_rating() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.ranked := new.origin = 'matchmaking' or
    (new.origin = 'room' and coalesce((select ranked from public.chess_rooms where id = new.room_id), false));
  if new.ranked then
    select rating into new.white_rating_before from public.player_ratings where player_id = new.white_id;
    select rating into new.black_rating_before from public.player_ratings where player_id = new.black_id;
    new.ranked := new.white_rating_before is not null and new.black_rating_before is not null;
  end if;
  return new;
end
$$;
create trigger gambit_game_rating_snapshot before insert on public.chess_games
for each row execute function public._snapshot_game_rating();

create function public._game_rating_eligibility() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.room_id is not null then
    if new.ply < 8 then
      new.rating_exclusion := 'private_minimum_moves';
    elsif (select count(*) from public.chess_games prior
      where prior.id <> new.id and prior.ranked and prior.room_id is not null
        and prior.status = 'finished' and prior.rating_exclusion is null
        and least(prior.white_id, prior.black_id) = least(new.white_id, new.black_id)
        and greatest(prior.white_id, prior.black_id) = greatest(new.white_id, new.black_id)
        and prior.ended_at >= new.ended_at - interval '24 hours') >= 2 then
      new.rating_exclusion := 'private_pair_limit';
    end if;
  end if;
  return new;
end
$$;
create trigger gambit_game_rating_eligibility before update of status on public.chess_games
for each row when (old.status = 'active' and new.status = 'finished' and new.ranked)
execute function public._game_rating_eligibility();

create function public._settle_game_rating() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  entry record;
  after_rating integer;
begin
  for entry in
    select v.*, case when new.result = 'draw' then 'draw' when new.result = v.color then 'win' else 'loss' end as outcome
    from (values (new.white_id, new.white_rating_before, new.black_rating_before, 'white'),
                 (new.black_id, new.black_rating_before, new.white_rating_before, 'black'))
      as v(player, before_rating, opponent_rating, color)
    order by v.player
  loop
    after_rating := greatest(0, entry.before_rating + public.rating_delta(entry.before_rating, entry.opponent_rating, entry.outcome));
    insert into public.rating_transactions values(
      new.id, entry.player, entry.before_rating, after_rating - entry.before_rating, after_rating,
      entry.opponent_rating, entry.outcome, public.rank_tier(entry.before_rating), public.rank_tier(after_rating), new.ended_at
    ) on conflict (game_id, player_id) do nothing;
    if found then
      update public.player_ratings set rating = after_rating, peak = greatest(peak, after_rating),
        wins = wins + (entry.outcome = 'win')::int,
        losses = losses + (entry.outcome = 'loss')::int,
        draws = draws + (entry.outcome = 'draw')::int
      where player_id = entry.player;
    end if;
  end loop;
  return new;
end
$$;
create trigger gambit_game_rating_settlement after update of status on public.chess_games
for each row when (old.status = 'active' and new.status = 'finished' and new.ranked and new.rating_exclusion is null)
execute function public._settle_game_rating();

create function public.game_rating_result(p_game uuid, p_user uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('ok',true,'rating',
    (select to_jsonb(t) - 'player_id' - 'game_id' from public.rating_transactions t where t.game_id = g.id and t.player_id = p_user),
    'exclusion',g.rating_exclusion)
  from public.chess_games g where g.id = p_game and p_user in (g.white_id,g.black_id)
$$;

create or replace function public._room_public(r public.chess_rooms)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'code', r.code, 'name', r.name, 'hostName', r.host_name,
    'initialMs', r.initial_ms, 'incrementMs', r.increment_ms,
    'hostColor', r.host_color, 'status', r.status, 'discoverable', r.discoverable,
    'players', case when r.guest_id is null then 1 else 2 end,
    'expiresAt', r.expires_at, 'gameId', r.game_id,
    'ranked', r.ranked, 'allowSpectators', r.allow_spectators
  )
$$;
create function public.create_configured_room(p_user uuid, p_name text, p_password text,
  p_initial integer, p_increment integer, p_color text, p_discoverable boolean, p_ranked boolean, p_spectators boolean)
returns jsonb language plpgsql set search_path = '' as $$
declare
  result jsonb;
  r public.chess_rooms;
begin
  result := public.create_room(p_user,p_name,p_password,p_initial,p_increment,p_color,p_discoverable);
  if not (result->>'ok')::boolean then return result; end if;
  update public.chess_rooms set ranked = p_ranked, allow_spectators = p_spectators
    where code = result->'room'->>'code' and host_id = p_user returning * into r;
  return jsonb_build_object('ok',true,'room',public._room_public(r));
end
$$;

alter table public.player_ratings enable row level security;
alter table public.rating_transactions enable row level security;
revoke all on public.player_ratings, public.rating_transactions from public, anon, authenticated;
grant select on public.player_ratings, public.rating_transactions to service_role;
revoke execute on function public.rank_tier(integer), public.rating_delta(integer,integer,text),
  public._initialize_rating(), public._snapshot_game_rating(), public._game_rating_eligibility(), public._settle_game_rating(),
  public.game_rating_result(uuid,uuid), public.create_configured_room(uuid,text,text,integer,integer,text,boolean,boolean,boolean)
  from public, anon, authenticated;
grant execute on function public.rank_tier(integer), public.rating_delta(integer,integer,text),
  public.game_rating_result(uuid,uuid), public.create_configured_room(uuid,text,text,integer,integer,text,boolean,boolean,boolean)
  to service_role;
