begin;
create schema if not exists nossom_private;
create table if not exists nossom_private.restoration_jobs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'uploading' check (status in ('uploading','submitting','queued','running','completed','failed','cancelled','released')),
  input_bytes integer not null check(input_bytes > 44 and input_bytes <= 104857600),
  input_parts integer not null check(input_parts between 1 and 5),
  duration double precision not null check(duration >= 0.1 and duration <= 600),
  provider_id text,
  report jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists restoration_jobs_user_status on nossom_private.restoration_jobs(user_id, status);
alter table nossom_private.restoration_jobs enable row level security;
revoke all on nossom_private.restoration_jobs from public, anon, authenticated;
-- Each physical object is <=20 MiB, including long WAVs split into private parts.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('nossom-restoration','nossom-restoration',false,20971520,array['application/octet-stream'])
on conflict(id) do update set public=false, file_size_limit=20971520, allowed_mime_types=array['application/octet-stream'];
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
  if p_user is null then raise exception 'Account required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('restore:'||p_user::text,0));
  if p_action='prepare' then
    if exists(select 1 from nossom_private.restoration_jobs where user_id=p_user and status in ('uploading','submitting','queued','running') and created_at>now()-interval '1 hour') then
      return jsonb_build_object('job',null);
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
      update nossom_private.restoration_jobs set status='released',updated_at=now() where id=p_id returning * into v_job;
    elsif p_action not in ('get','claim','update','fail') then raise exception 'Invalid action';
    end if;
  end if;
  return jsonb_build_object('job',case when v_job.id is null then null else to_jsonb(v_job) end,'claimed',v_claimed);
end;
$$;
revoke all on function public.nossom_restoration_job(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.nossom_restoration_job(text,uuid,uuid,jsonb) to service_role;
commit;
