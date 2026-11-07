-- Owner-only Secret Mode: who the owner is, and where their analysis
-- preferences live. Additive and safe to re-run.
--
-- The owner is decided here, from auth.users, never from anything the browser
-- sends: the account must carry the owner's address AND have confirmed it.
-- Supabase only changes `email` after the new address is confirmed, so nobody
-- can claim it without access to that inbox.

create or replace function public._is_owner(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users
    where id = p_user
      and lower(email) = 'itssayem2023@gmail.com'
      and email_confirmed_at is not null
  )
$$;

create table if not exists public.owner_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint owner_settings_object check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) < 4096)
);

-- No browser role may touch the table at all; only the API (service role)
-- reads or writes it, and only through the functions below.
alter table public.owner_settings enable row level security;
revoke all on public.owner_settings from public, anon, authenticated;
grant all on public.owner_settings to service_role;

-- Non-owners get `owner: false` and nothing else, so the feature stays invisible.
create or replace function public.get_owner_settings(p_user uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public._is_owner(p_user) then
    return jsonb_build_object('ok', true, 'owner', false);
  end if;
  return jsonb_build_object('ok', true, 'owner', true, 'settings',
    coalesce((select settings from public.owner_settings where user_id = p_user), '{}'::jsonb));
end;
$$;

create or replace function public.set_owner_settings(p_user uuid, p_settings jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if not public._is_owner(p_user) then
    return jsonb_build_object('ok', false, 'error', 'not_owner');
  end if;
  if jsonb_typeof(p_settings) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid_settings');
  end if;
  insert into public.owner_settings (user_id, settings, updated_at) values (p_user, p_settings, now())
  on conflict (user_id) do update set settings = excluded.settings, updated_at = excluded.updated_at;
  return jsonb_build_object('ok', true, 'owner', true, 'settings', p_settings);
end;
$$;

revoke all on function public._is_owner(uuid) from public, anon, authenticated;
revoke all on function public.get_owner_settings(uuid) from public, anon, authenticated;
revoke all on function public.set_owner_settings(uuid, jsonb) from public, anon, authenticated;
grant execute on function public._is_owner(uuid) to service_role;
grant execute on function public.get_owner_settings(uuid) to service_role;
grant execute on function public.set_owner_settings(uuid, jsonb) to service_role;
