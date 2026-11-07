-- Contact form messages. Additive and safe to re-run.
-- Written only through submit_contact (service_role); never readable by browser keys.

create table if not exists public.contact_messages (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.contact_messages enable row level security;
revoke all on public.contact_messages from public, anon, authenticated;
grant all on public.contact_messages to service_role;

-- `p_key` is the client address, for rate limiting (5 messages per 10 minutes).
create or replace function public.submit_contact(p_name text, p_email text, p_message text, p_key text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_email text := btrim(coalesce(p_email, ''));
  v_message text := btrim(coalesce(p_message, ''));
begin
  if not public._rate_limit('contact:' || coalesce(p_key, '?'), 5, 600) then
    return public._error('rate_limited');
  end if;
  if char_length(v_name) not between 1 and 80 then
    return public._error('invalid_contact_name');
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return public._error('invalid_email');
  end if;
  if char_length(v_message) not between 10 and 4000 then
    return public._error('invalid_contact_message');
  end if;
  insert into public.contact_messages (name, email, message) values (v_name, v_email, v_message);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.submit_contact(text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_contact(text, text, text, text) to service_role;
