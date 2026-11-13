create function public.list_live_spectator_games(p_user uuid, p_offset integer)
returns jsonb language plpgsql set search_path = '' as $$
declare
  games jsonb;
begin
  if not public._rate_limit('watch-list:' || p_user,60,60) then
    return public._error('rate_limited');
  end if;

  select coalesce(jsonb_agg(to_jsonb(page) - 'started_at' order by page.started_at desc,page.id),'[]'::jsonb)
    into games
  from (
    select eligible.* from (
      select g.id,g.white_name as white,g.black_name as black,'online'::text as kind,g.ranked,g.created_at as started_at
      from public.chess_games g
      where g.status = 'active'
        and public._may_watch(p_user, row(g.id,g.white_id,g.id,'online',null,0,g.created_at,g.created_at,null)::public.spectator_sessions)
        and exists (
          select 1 from public.player_profiles p
          left join public.social_preferences prefs on prefs.player_id = p.id
          where p.id in (g.white_id,g.black_id) and p.active_game_id = g.id
            and public._are_friends(p_user,p.id) and coalesce(prefs.show_activity,true)
        )
      union all
      select s.id,s.snapshot->>'white',s.snapshot->>'black',s.kind,false,s.created_at
      from public.spectator_sessions s
      left join public.social_preferences prefs on prefs.player_id = s.host_id
      where s.kind in ('local','computer') and s.snapshot->>'status' = 'active'
        and s.last_activity > now() - interval '25 seconds'
        and coalesce(prefs.show_activity,true) and public._may_watch(p_user,s)
    ) eligible
    order by eligible.started_at desc,eligible.id
    limit 31 offset greatest(0,p_offset)
  ) page;

  return jsonb_build_object('ok',true,'games',games);
end
$$;

revoke execute on function public.list_live_spectator_games(uuid,integer) from public,anon,authenticated;
grant execute on function public.list_live_spectator_games(uuid,integer) to service_role;
