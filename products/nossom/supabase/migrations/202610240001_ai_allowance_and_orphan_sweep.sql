begin;
-- Durable daily cap on new assistant conversations per account (in-memory limits are per instance).
create table if not exists nossom_private.ai_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  sessions integer not null default 0 check (sessions >= 0),
  primary key (user_id, day)
);
alter table nossom_private.ai_sessions enable row level security;
revoke all on nossom_private.ai_sessions from public, anon, authenticated;
create or replace function public.nossom_ai_session()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid(); v_admin boolean; v_day date := (now() at time zone 'America/Fortaleza')::date;
  v_limit constant integer := 40; v_used integer;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select lower(email) = 'victorbarrosoc@gmail.com' and email_confirmed_at is not null into v_admin
    from auth.users where id = v_user;
  if not found then raise exception 'Authentication required' using errcode = '28000'; end if;
  if coalesce(v_admin, false) then return jsonb_build_object('allowed', true, 'used', 0, 'limit', null); end if;
  insert into nossom_private.ai_sessions(user_id, day, sessions) values (v_user, v_day, 1)
    on conflict (user_id, day) do update set sessions = nossom_private.ai_sessions.sessions + 1
    where nossom_private.ai_sessions.sessions < v_limit
    returning sessions into v_used;
  delete from nossom_private.ai_sessions where day < v_day - 7;
  return jsonb_build_object('allowed', v_used is not null, 'used', coalesce(v_used, v_limit), 'limit', v_limit);
end;
$$;
revoke all on function public.nossom_ai_session() from public, anon;
grant execute on function public.nossom_ai_session() to authenticated;

-- Released or failed jobs may still receive uploads through signed URLs issued before release.
-- 'orphans' lists those recent jobs so the daily cron deletes their objects again by prefix.
-- 'prepare' is capped per account and day to bound storage churn from repeated prepare/cancel.
create or replace function public.nossom_restoration_job(p_action text, p_user uuid, p_id uuid default null, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_job nossom_private.restoration_jobs%rowtype; v_claimed boolean := false;
begin
  -- EXECUTE is granted only to service_role. Ownership is checked again by the
  -- app's live Supabase session before supplying p_user; browsers cannot call it.
  if p_action='stale' then
    return jsonb_build_object('jobs',coalesce((select jsonb_agg(t) from
      (select * from nossom_private.restoration_jobs where status<>'released' and created_at<now()-interval '24 hours' order by created_at limit 100) t),'[]'::jsonb));
  end if;
  if p_action='orphans' then
    return jsonb_build_object('jobs',coalesce((select jsonb_agg(t) from
      (select * from nossom_private.restoration_jobs where status in ('released','failed','cancelled')
        and updated_at>now()-interval '3 days' and updated_at<now()-interval '3 hours'
        order by updated_at limit 300) t),'[]'::jsonb));
  end if;
  if p_user is null then raise exception 'Account required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('restore:'||p_user::text,0));
  if p_action='prepare' then
    if exists(select 1 from nossom_private.restoration_jobs where user_id=p_user and status in ('uploading','submitting','queued','running') and created_at>now()-interval '1 hour') then
      return jsonb_build_object('job',null);
    end if;
    if (select count(*) from nossom_private.restoration_jobs where user_id=p_user and created_at>now()-interval '24 hours') >= 40 then
      return jsonb_build_object('job',null,'limited',true);
    end if;
    insert into nossom_private.restoration_jobs(id,user_id,input_bytes,input_parts,duration)
      values(p_id,p_user,(p_data->>'input_bytes')::integer,(p_data->>'input_parts')::integer,(p_data->>'duration')::double precision) returning * into v_job;
  elsif p_action='pending' then
    select * into v_job from nossom_private.restoration_jobs where user_id=p_user and status in ('uploading','submitting','queued','running','completed') and created_at>now()-interval '1 hour' order by created_at desc limit 1;
  else
    select * into v_job from nossom_private.restoration_jobs where id=p_id and user_id=p_user for update;
    if not found then return jsonb_build_object('job',null); end if;
    if p_action='claim' and v_job.status='uploading' and v_job.created_at>now()-interval '30 minutes' then
      update nossom_private.restoration_jobs set status='submitting',updated_at=now() where id=p_id returning * into v_job;
      v_claimed:=true;
    elsif p_action='update' and v_job.status in ('submitting','queued','running') then
      if p_data->>'status' not in ('queued','running','completed') then raise exception 'Invalid transition'; end if;
      update nossom_private.restoration_jobs set status=p_data->>'status',provider_id=coalesce(p_data->>'provider_id',provider_id),report=coalesce(p_data->'report',report),updated_at=now() where id=p_id returning * into v_job;
    elsif p_action='fail' and v_job.status in ('uploading','submitting','queued','running') then
      update nossom_private.restoration_jobs set status='failed',updated_at=now() where id=p_id returning * into v_job;
      delete from nossom_private.audio_treatments where user_id=p_user and request_id=p_id;
    elsif p_action='release' then
      -- Keep the original release time so a re-sweep does not extend the orphan window.
      update nossom_private.restoration_jobs set status='released',updated_at=case when status='released' then updated_at else now() end where id=p_id returning * into v_job;
    elsif p_action not in ('get','claim','update','fail') then raise exception 'Invalid action';
    end if;
  end if;
  return jsonb_build_object('job',case when v_job.id is null then null else to_jsonb(v_job) end,'claimed',v_claimed);
end;
$$;
revoke all on function public.nossom_restoration_job(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.nossom_restoration_job(text,uuid,uuid,jsonb) to service_role;
commit;
