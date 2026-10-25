-- NOSSOM: run once in the connected project's SQL Editor or via `supabase db push`.
-- No service-role key in the browser. Identity and admin status come from auth.users.
begin;
create schema if not exists nossom_private;
revoke all on schema nossom_private from public, anon, authenticated;
create table if not exists nossom_private.audio_treatments (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  week_start timestamptz not null,
  operation text not null check (operation in ('auto','denoise','clarity','wind','level','eq','master','effects','mix')),
  created_at timestamptz not null default now(),
  primary key(user_id, request_id)
);
create index if not exists audio_treatments_user_week_idx on nossom_private.audio_treatments(user_id, week_start);
alter table nossom_private.audio_treatments enable row level security;
revoke all on nossom_private.audio_treatments from public, anon, authenticated;
-- A single atomic function serves both status and authorization. A transaction lock
-- serializes a user's requests across tabs, devices and concurrent Vercel instances.
create or replace function public.nossom_audio_usage(p_request_id uuid default null, p_operation text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_admin boolean;
  v_week timestamptz := date_trunc('week', now() at time zone 'America/Fortaleza') at time zone 'America/Fortaleza';
  v_reset timestamptz;
  v_used integer;
  v_existing boolean := false;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select lower(u.email) = 'victorbarrosoc@gmail.com' and u.email_confirmed_at is not null
    into v_admin from auth.users u where u.id = v_user;
  if not found then raise exception 'Authentication required' using errcode = '28000'; end if;
  v_admin := coalesce(v_admin, false);
  v_reset := ((v_week at time zone 'America/Fortaleza') + interval '7 days') at time zone 'America/Fortaleza';
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  select count(*) into v_used from nossom_private.audio_treatments t where t.user_id = v_user and t.week_start = v_week;
  if p_request_id is not null then
    if p_operation is null or p_operation not in ('auto','denoise','clarity','wind','level','eq','master','effects','mix') then
      raise exception 'Invalid operation' using errcode = '22023';
    end if;
    -- Idempotency covers retries of the same authorization, never another week's use.
    select exists(select 1 from nossom_private.audio_treatments t where t.user_id = v_user and t.request_id = p_request_id and t.week_start = v_week and t.operation = p_operation) into v_existing;
    if not v_existing then
      if not v_admin and v_used >= 10 then
        return jsonb_build_object('allowed', false, 'used', v_used, 'remaining', 0, 'limit', 10, 'unlimited', false, 'resetAt', v_reset);
      end if;
      if exists(select 1 from nossom_private.audio_treatments t where t.user_id = v_user and t.request_id = p_request_id) then
        raise exception 'Request already used with another operation or week' using errcode = '22023';
      end if;
      insert into nossom_private.audio_treatments(user_id, request_id, week_start, operation) values(v_user, p_request_id, v_week, p_operation);
      v_used := v_used + 1;
    end if;
  end if;
  return jsonb_build_object('allowed', v_admin or v_used < 10 or p_request_id is not null, 'used', v_used, 'remaining', case when v_admin then null else greatest(0, 10-v_used) end, 'limit', case when v_admin then null else 10 end, 'unlimited', v_admin, 'resetAt', v_reset, 'requestId', p_request_id);
end;
$$;
revoke all on function public.nossom_audio_usage(uuid, text) from public, anon;
grant execute on function public.nossom_audio_usage(uuid, text) to authenticated;
comment on function public.nossom_audio_usage(uuid, text) is '10 treatment authorizations per account each Monday 00:00 America/Fortaleza. Verified platform admin is unlimited.';
commit;
