-- Absolute ZRO · mudança do banco para São Paulo · passo 2e: NOSSOM, Carro do Freela e conferência final da estrutura
-- RODE NO PROJETO: AbsoluteZRO-SP (São Paulo, ref njvhgycmbuhimxovxuqj)  <-- o NOVO. Nunca no AbsoluteZRO antigo.
-- Gerado das migrations do repositório (origin/main). Não edite à mão.
-- Roda inteiro de uma vez: se der erro, nada fica pela metade (o bloco volta atrás sozinho).
do $guarda$ begin if not exists (select 1 from pg_namespace where nspname = 'sobedesce') or to_regclass('sobedesce.__drizzle_migrations') is null then raise exception 'PARE: rode antes os passos 2a a 2d (ou você está no projeto errado).'; end if; end $guarda$;
do $guarda$ begin if exists (select 1 from pg_namespace where nspname = 'nossom_private') then raise exception 'PARE: o NOSSOM já existe aqui. O passo 2e já foi feito, ou este é o projeto antigo.'; end if; end $guarda$;
set local search_path to "$user", public, extensions;

-- ===== NOSSOM 202610220001_accounts_and_weekly_usage.sql (sem o begin/commit do arquivo) =====
-- NOSSOM: run once in the connected project's SQL Editor or via `supabase db push`.
-- No service-role key in the browser. Identity and admin status come from auth.users.
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
;

-- ===== NOSSOM 202610230001_cloud_restoration.sql (sem o begin/commit do arquivo) =====
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
;

-- ===== NOSSOM 202610230002_plans_and_admin.sql (sem o begin/commit do arquivo) =====
create table if not exists nossom_private.plans (
  id text primary key check(id in ('free','essential','studio')),
  name text not null,
  monthly_seconds integer not null check(monthly_seconds between 0 and 864000),
  price_cents integer not null check(price_cents between 0 and 1000000)
);
insert into nossom_private.plans values ('free','Grátis',300,0),('essential','Essencial',7200,3900),('studio','Studio',21600,9900) on conflict(id) do nothing;
create table if not exists nossom_private.memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id text not null references nossom_private.plans(id),
  seconds_override integer check(seconds_override between 0 and 864000),
  expires_at timestamptz,
  blocked boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create table if not exists nossom_private.restoration_usage (
  request_id uuid primary key references nossom_private.restoration_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seconds integer not null check(seconds between 1 and 600),
  period_start timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists restoration_usage_user_period on nossom_private.restoration_usage(user_id,period_start);
create table if not exists nossom_private.admin_settings (id boolean primary key default true check(id), estimated_gpu_usd_hour numeric not null check(estimated_gpu_usd_hour between 0.01 and 50));
insert into nossom_private.admin_settings values(true,1.50) on conflict do nothing;
create table if not exists nossom_private.plan_audit (
  id bigint generated always as identity primary key, actor uuid references auth.users(id),
  target uuid references auth.users(id) on delete set null, action text not null, details jsonb not null,
  created_at timestamptz not null default now()
);
alter table nossom_private.plans enable row level security;
alter table nossom_private.memberships enable row level security;
alter table nossom_private.restoration_usage enable row level security;
alter table nossom_private.admin_settings enable row level security;
alter table nossom_private.plan_audit enable row level security;
revoke all on nossom_private.plans,nossom_private.memberships,nossom_private.restoration_usage,nossom_private.admin_settings,nossom_private.plan_audit from public,anon,authenticated;
alter table nossom_private.restoration_jobs add column if not exists outcome text check(outcome in ('completed','failed'));
alter table nossom_private.restoration_jobs add column if not exists runtime_ms bigint;

create or replace function nossom_private.restoration_outcome() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='completed' then new.outcome:='completed'; end if;
  if new.status='failed' and old.status in ('uploading','submitting','queued','running') then
    new.outcome:='failed';
    delete from nossom_private.restoration_usage where request_id=new.id and user_id=new.user_id;
  end if;
  return new;
end;
$$;
drop trigger if exists restoration_outcome on nossom_private.restoration_jobs;
create trigger restoration_outcome before update on nossom_private.restoration_jobs for each row execute function nossom_private.restoration_outcome();

create or replace function public.nossom_plan_usage(p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid(); v_admin boolean; v_plan nossom_private.plans%rowtype;
  v_member nossom_private.memberships%rowtype; v_job nossom_private.restoration_jobs%rowtype;
  v_start timestamptz:=date_trunc('month',now() at time zone 'America/Fortaleza') at time zone 'America/Fortaleza';
  v_reset timestamptz; v_used integer; v_limit integer; v_existing boolean:=false; v_allowed boolean;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select lower(email)='victorbarrosoc@gmail.com' and email_confirmed_at is not null into v_admin from auth.users where id=v_user;
  if not found then raise exception 'Authentication required' using errcode='28000'; end if;
  v_admin:=coalesce(v_admin,false);
  perform pg_advisory_xact_lock(hashtextextended('minutes:'||v_user::text,0));
  select * into v_member from nossom_private.memberships where user_id=v_user;
  select * into v_plan from nossom_private.plans where id=case when v_member.plan_id is not null and (v_member.expires_at is null or v_member.expires_at>now()) then v_member.plan_id else 'free' end;
  v_limit:=case when coalesce(v_member.blocked,false) then 0 when v_member.plan_id=v_plan.id then coalesce(v_member.seconds_override,v_plan.monthly_seconds) else v_plan.monthly_seconds end;
  v_reset:=((v_start at time zone 'America/Fortaleza')+interval '1 month') at time zone 'America/Fortaleza';
  select coalesce(sum(seconds),0)::integer into v_used from nossom_private.restoration_usage where user_id=v_user and period_start=v_start;
  v_allowed:=v_admin or v_used<v_limit;
  if p_request_id is not null then
    select exists(select 1 from nossom_private.restoration_usage where request_id=p_request_id and user_id=v_user and period_start=v_start) into v_existing;
    if v_existing then v_allowed:=true;
    else
      select * into v_job from nossom_private.restoration_jobs where id=p_request_id and user_id=v_user and status='submitting';
      if not found then raise exception 'Job not authorized' using errcode='22023'; end if;
      v_allowed:=v_admin or v_used+greatest(60,ceil(v_job.duration)::integer)<=v_limit;
      if v_allowed then
        insert into nossom_private.restoration_usage(request_id,user_id,seconds,period_start) values(p_request_id,v_user,greatest(60,ceil(v_job.duration)::integer),v_start);
        v_used:=v_used+greatest(60,ceil(v_job.duration)::integer);
      end if;
    end if;
  end if;
  return jsonb_build_object('allowed',v_allowed,'used',v_used,'remaining',case when v_admin then null else greatest(0,v_limit-v_used) end,'limit',case when v_admin then null else v_limit end,'unlimited',v_admin,'resetAt',v_reset,'unit','seconds','planId',v_plan.id,'planName',v_plan.name,'usedSeconds',v_used,'limitSeconds',case when v_admin then null else v_limit end,'remainingSeconds',case when v_admin then null else greatest(0,v_limit-v_used) end,'blocked',coalesce(v_member.blocked,false),'requestId',p_request_id);
end;
$$;
revoke all on function public.nossom_plan_usage(uuid) from public,anon;
grant execute on function public.nossom_plan_usage(uuid) to authenticated;

create or replace function public.nossom_plan_catalog()
returns jsonb language sql security definer set search_path='' as $$
  select jsonb_agg(to_jsonb(p) order by p.price_cents) from nossom_private.plans p;
$$;
revoke all on function public.nossom_plan_catalog() from public;
grant execute on function public.nossom_plan_catalog() to anon,authenticated;

create or replace function public.nossom_admin(p_action text default 'dashboard',p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid(); v_target uuid; v_plan text; v_seconds integer; v_price integer;
  v_name text; v_expires timestamptz; v_override integer; v_blocked boolean;
  v_period timestamptz:=date_trunc('month',now() at time zone 'America/Fortaleza') at time zone 'America/Fortaleza';
  v_users jsonb; v_days jsonb; v_total integer; v_search text:=left(coalesce(p_data->>'search',''),100);
  v_page integer:=greatest(0,least(10000,coalesce((p_data->>'page')::integer,0)));
begin
  if not exists(select 1 from auth.users where id=v_actor and lower(email)='victorbarrosoc@gmail.com' and email_confirmed_at is not null) then raise exception 'Admin required' using errcode='42501'; end if;
  if p_action='set_member' then
    v_target:=(p_data->>'userId')::uuid; v_plan:=p_data->>'planId';
    v_override:=(p_data->>'secondsOverride')::integer; v_expires:=(p_data->>'expiresAt')::timestamptz;
    v_blocked:=coalesce((p_data->>'blocked')::boolean,false);
    if v_plan not in ('free','essential','studio') or v_plan is null or (v_override is not null and (v_override<0 or v_override>864000)) then raise exception 'Invalid plan'; end if;
    if not exists(select 1 from auth.users where id=v_target) then raise exception 'Account not found'; end if;
    insert into nossom_private.memberships(user_id,plan_id,seconds_override,expires_at,blocked,updated_by) values(v_target,v_plan,v_override,v_expires,v_blocked,v_actor)
    on conflict(user_id) do update set plan_id=excluded.plan_id,seconds_override=excluded.seconds_override,expires_at=excluded.expires_at,blocked=excluded.blocked,updated_by=v_actor,updated_at=now();
    insert into nossom_private.plan_audit(actor,target,action,details) values(v_actor,v_target,p_action,p_data);
    return jsonb_build_object('ok',true);
  elsif p_action='set_plan' then
    v_plan:=p_data->>'planId'; v_seconds:=(p_data->>'monthlySeconds')::integer; v_price:=(p_data->>'priceCents')::integer; v_name:=left(trim(p_data->>'name'),40);
    if v_seconds is null or v_seconds<0 or v_seconds>864000 or v_price is null or v_price<0 or v_price>1000000 or v_name is null or length(v_name)<2 or (v_plan='free' and v_price<>0) then raise exception 'Invalid plan settings'; end if;
    update nossom_private.plans set name=v_name,monthly_seconds=v_seconds,price_cents=v_price where id=v_plan;
    if not found then raise exception 'Unknown plan'; end if;
    insert into nossom_private.plan_audit(actor,action,details) values(v_actor,p_action,p_data);
    return jsonb_build_object('ok',true);
  elsif p_action='set_cost' then
    update nossom_private.admin_settings set estimated_gpu_usd_hour=(p_data->>'usdPerHour')::numeric where id=true;
    insert into nossom_private.plan_audit(actor,action,details) values(v_actor,p_action,p_data);
    return jsonb_build_object('ok',true);
  elsif p_action='runtime' then
    -- Only account ADM may inspect data, not modify job runtime through this RPC.
    raise exception 'Invalid action';
  elsif p_action<>'dashboard' then raise exception 'Invalid action';
  end if;
  select count(*)::integer into v_total from auth.users u where position(lower(v_search) in lower(coalesce(u.email,'')||' '||coalesce(u.raw_user_meta_data->>'name',''))) > 0;
  select coalesce(jsonb_agg(t),'[]'::jsonb) into v_users from (
    select u.id,u.email,coalesce(u.raw_user_meta_data->>'name',split_part(u.email,'@',1)) as name,u.created_at,
      lower(u.email)='victorbarrosoc@gmail.com' and u.email_confirmed_at is not null as is_admin,
      p.id as plan_id,p.name as plan_name,coalesce(m.blocked,false) as blocked,
      case when coalesce(m.blocked,false) then 0 when p.id=m.plan_id then coalesce(m.seconds_override,p.monthly_seconds) else p.monthly_seconds end as limit_seconds,
      m.seconds_override,m.expires_at,m.plan_id as assigned_plan_id,
      coalesce((select sum(s.seconds) from nossom_private.restoration_usage s where s.user_id=u.id and s.period_start=v_period),0) as used_seconds,
      (select count(*) from nossom_private.restoration_jobs j where j.user_id=u.id) as job_count,
      (select count(*) from nossom_private.restoration_jobs j where j.user_id=u.id and j.outcome='failed') as failed_count,
      coalesce((select sum(j.input_bytes) from nossom_private.restoration_jobs j where j.user_id=u.id and j.status<>'uploading'),0) as uploaded_bytes
    from auth.users u left join nossom_private.memberships m on m.user_id=u.id
      join nossom_private.plans p on p.id=case when m.plan_id is not null and (m.expires_at is null or m.expires_at>now()) then m.plan_id else 'free' end
    where position(lower(v_search) in lower(coalesce(u.email,'')||' '||coalesce(u.raw_user_meta_data->>'name',''))) > 0
    order by u.created_at desc limit 25 offset v_page*25
  )t;
  select jsonb_agg(t order by day) into v_days from (
    select to_char(d,'YYYY-MM-DD') as day,
      coalesce((select sum(s.seconds) from nossom_private.restoration_usage s where (s.created_at at time zone 'America/Fortaleza')::date=d::date),0) as seconds,
      (select count(*) from nossom_private.restoration_jobs j where (j.created_at at time zone 'America/Fortaleza')::date=d::date and j.outcome='completed') as completed,
      (select count(*) from nossom_private.restoration_jobs j where (j.created_at at time zone 'America/Fortaleza')::date=d::date and j.outcome='failed') as failed
    from generate_series((now() at time zone 'America/Fortaleza')::date-29,(now() at time zone 'America/Fortaleza')::date,interval '1 day') d
  )t;
  return jsonb_build_object('users',v_users,'totalUsers',v_total,'page',v_page,'days',v_days,
    'plans',(select jsonb_agg(to_jsonb(p) order by price_cents) from nossom_private.plans p),
    'totals',jsonb_build_object('users',(select count(*) from auth.users),
      'monthlySeconds',(select coalesce(sum(seconds),0) from nossom_private.restoration_usage where period_start=v_period),
      'completed',(select count(*) from nossom_private.restoration_jobs where created_at>=v_period and outcome='completed'),
      'failed',(select count(*) from nossom_private.restoration_jobs where created_at>=v_period and outcome='failed'),
      'pending',(select count(*) from nossom_private.restoration_jobs where created_at>=v_period and status in ('uploading','submitting','queued','running')),
      'runtimeSeconds',(select coalesce(sum(runtime_ms),0)/1000.0 from nossom_private.restoration_jobs where created_at>=v_period),
      'gpuUsdHour',(select estimated_gpu_usd_hour from nossom_private.admin_settings where id=true)));
end;
$$;
revoke all on function public.nossom_admin(text,jsonb) from public,anon;
grant execute on function public.nossom_admin(text,jsonb) to authenticated;
-- Separate service-only timing recorder; normal users and the admin UI cannot forge costs.
create or replace function public.nossom_job_runtime(p_id uuid,p_user uuid,p_runtime bigint)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_runtime<0 or p_runtime>3600000 then raise exception 'Invalid runtime'; end if;
  update nossom_private.restoration_jobs set runtime_ms=p_runtime where id=p_id and user_id=p_user;
end;
$$;
revoke all on function public.nossom_job_runtime(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.nossom_job_runtime(uuid,uuid,bigint) to service_role;
;

-- ===== NOSSOM 202610240001_ai_allowance_and_orphan_sweep.sql (sem o begin/commit do arquivo) =====
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
;

-- ===== NOSSOM 202610250001_stripe_subscriptions.sql (sem o begin/commit do arquivo) =====
-- Monthly card subscriptions through Stripe. Stripe is the source of truth for payment; this
-- table mirrors the latest subscription state the server read back from Stripe's API, and the
-- membership row carries the plan the quota functions already enforce.
create table if not exists nossom_private.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  customer_id text not null unique,
  subscription_id text unique,
  plan_id text references nossom_private.plans(id),
  status text,
  period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table nossom_private.subscriptions enable row level security;
revoke all on nossom_private.subscriptions from public, anon, authenticated;

create or replace function public.nossom_subscription(p_action text, p_user uuid, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_row nossom_private.subscriptions%rowtype;
  v_member nossom_private.memberships%rowtype;
  v_plan text := p_data->>'planId';
  v_status text := p_data->>'status';
  v_end timestamptz := (p_data->>'periodEnd')::timestamptz;
begin
  -- EXECUTE is granted only to service_role: the app calls it after reading its own session
  -- (get, customer) or after verifying a Stripe-signed event and fetching the subscription back
  -- from Stripe (apply). Browsers cannot call it.
  if p_user is null or not exists(select 1 from auth.users where id = p_user) then
    raise exception 'Account required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('subscription:' || p_user::text, 0));
  select * into v_row from nossom_private.subscriptions where user_id = p_user;
  if p_action = 'get' then
    return jsonb_build_object('subscription', case when v_row.user_id is null then null else to_jsonb(v_row) end);
  elsif p_action = 'customer' then
    if v_row.user_id is null then
      insert into nossom_private.subscriptions(user_id, customer_id) values (p_user, p_data->>'customerId') returning * into v_row;
    end if;
    -- An existing customer is kept: one Stripe customer per account.
    return jsonb_build_object('subscription', to_jsonb(v_row));
  elsif p_action <> 'apply' then
    raise exception 'Invalid action';
  end if;
  if v_row.user_id is null or v_row.customer_id <> p_data->>'customerId' then
    raise exception 'Customer does not belong to this account';
  end if;
  if v_plan not in ('essential', 'studio') or v_status is null or v_end is null then
    raise exception 'Invalid subscription';
  end if;
  -- A late event about an older, ended subscription must not end the newer one.
  if v_row.subscription_id is not null and v_row.subscription_id <> p_data->>'subscriptionId'
     and v_status not in ('active', 'trialing', 'past_due') then
    return jsonb_build_object('subscription', to_jsonb(v_row), 'ignored', true);
  end if;
  update nossom_private.subscriptions set subscription_id = p_data->>'subscriptionId', plan_id = v_plan,
    status = v_status, period_end = v_end, cancel_at_period_end = coalesce((p_data->>'cancelAtPeriodEnd')::boolean, false),
    updated_at = now() where user_id = p_user returning * into v_row;
  select * into v_member from nossom_private.memberships where user_id = p_user;
  if v_status in ('active', 'trialing', 'past_due') then
    -- Paid through the current period, with three days for Stripe's retries to settle.
    -- Blocking set by the ADM is kept; a plan change clears a per-account override.
    insert into nossom_private.memberships(user_id, plan_id, expires_at, blocked, updated_by)
      values (p_user, v_plan, v_end + interval '3 days', false, null)
    on conflict (user_id) do update set plan_id = excluded.plan_id, expires_at = excluded.expires_at,
      seconds_override = case when nossom_private.memberships.plan_id = excluded.plan_id then nossom_private.memberships.seconds_override end,
      updated_by = null, updated_at = now();
  elsif v_member.user_id is not null and v_member.updated_by is null and v_member.plan_id = v_plan then
    -- Ended or unpaid: a plan this subscription granted ends now. A plan the ADM set by hand stays.
    update nossom_private.memberships set expires_at = least(coalesce(expires_at, now()), now()), updated_at = now() where user_id = p_user;
  end if;
  insert into nossom_private.plan_audit(actor, target, action, details) values (null, p_user, 'stripe', p_data);
  return jsonb_build_object('subscription', to_jsonb(v_row));
end;
$$;
revoke all on function public.nossom_subscription(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.nossom_subscription(text, uuid, jsonb) to service_role;
;

-- ===== NOSSOM 202610250002_zro_links.sql (sem o begin/commit do arquivo) =====
-- "Continuar com Absolute ZRO": a conta Absolute ZRO (o `sub` do id_token, já conferido no
-- servidor da NOSSOM) fica ligada a uma conta Supabase da NOSSOM. Uma pessoa ZRO, uma conta
-- NOSSOM; uma conta NOSSOM, uma pessoa ZRO. Nada aqui é lido pelo navegador.
create schema if not exists nossom_private;
create table if not exists nossom_private.zro_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  zro_sub text not null unique check (length(zro_sub) between 1 and 255),
  email text not null check (length(email) between 3 and 254),
  organization text check (organization is null or length(organization) <= 200),
  products text[] not null default '{}',
  -- Conta criada pelo "Continuar com Absolute ZRO": não tem senha, então a ligação é o único
  -- jeito de entrar e não pode ser desfeita pela própria pessoa.
  created_by_zro boolean not null default false,
  linked_at timestamptz not null default now(),
  last_login_at timestamptz
);
alter table nossom_private.zro_links enable row level security;
revoke all on nossom_private.zro_links from public, anon, authenticated;

create or replace function public.nossom_zro_link(
  p_action text,
  p_user uuid default null,
  p_sub text default null,
  p_data jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_row nossom_private.zro_links%rowtype;
  v_other nossom_private.zro_links%rowtype;
  v_email text := lower(trim(coalesce(p_data->>'email', '')));
  v_org text := nullif(left(trim(coalesce(p_data->>'organization', '')), 200), '');
  v_products text[] := coalesce(
    (select array_agg(left(value, 64)) from jsonb_array_elements_text(
      case when jsonb_typeof(p_data->'products') = 'array' then p_data->'products' else '[]'::jsonb end
    ) as t(value)),
    '{}'
  );
begin
  -- EXECUTE só para service_role: o servidor da NOSSOM chama depois de conferir o id_token
  -- (assinatura, emissor, público, validade e nonce) ou a sessão da própria pessoa.
  if p_action = 'find' then
    if p_sub is null or p_sub = '' then raise exception 'Invalid subject'; end if;
    update nossom_private.zro_links set
      email = case when v_email = '' then email else v_email end,
      organization = v_org, products = v_products, last_login_at = now()
    where zro_sub = p_sub returning * into v_row;
    return jsonb_build_object('userId', v_row.user_id);
  end if;
  if p_user is null or not exists(select 1 from auth.users where id = p_user) then
    raise exception 'Account required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('zro-link:' || p_user::text, 0));
  select * into v_row from nossom_private.zro_links where user_id = p_user;
  if p_action = 'get' then
    return jsonb_build_object('link', case when v_row.user_id is null then null else jsonb_build_object(
      'email', v_row.email, 'organization', v_row.organization, 'products', to_jsonb(v_row.products),
      'createdByZro', v_row.created_by_zro, 'linkedAt', v_row.linked_at, 'lastLoginAt', v_row.last_login_at
    ) end);
  elsif p_action = 'link' then
    if p_sub is null or p_sub = '' or length(p_sub) > 255 or v_email = '' then
      raise exception 'Invalid link';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('zro-sub:' || p_sub, 0));
    select * into v_other from nossom_private.zro_links where zro_sub = p_sub;
    -- Uma pessoa ZRO já ligada a outra conta NOSSOM: nunca troca de dono sozinha.
    if v_other.user_id is not null and v_other.user_id <> p_user then
      return jsonb_build_object('error', 'other_account');
    end if;
    if v_row.user_id is not null and v_row.zro_sub <> p_sub then
      return jsonb_build_object('error', 'already_linked');
    end if;
    if v_row.user_id is null then
      insert into nossom_private.zro_links(user_id, zro_sub, email, organization, products, created_by_zro, last_login_at)
        values (p_user, p_sub, v_email, v_org, v_products, coalesce((p_data->>'createdByZro')::boolean, false),
          case when coalesce((p_data->>'createdByZro')::boolean, false) then now() end);
    else
      update nossom_private.zro_links set email = v_email, organization = v_org, products = v_products
        where user_id = p_user;
    end if;
    return jsonb_build_object('ok', true);
  elsif p_action = 'unlink' then
    if v_row.user_id is null then return jsonb_build_object('ok', true); end if;
    -- Conta sem senha ficaria sem como entrar.
    if v_row.created_by_zro then return jsonb_build_object('error', 'only_login'); end if;
    delete from nossom_private.zro_links where user_id = p_user;
    return jsonb_build_object('ok', true);
  end if;
  raise exception 'Invalid action';
end;
$$;
revoke all on function public.nossom_zro_link(text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.nossom_zro_link(text, uuid, text, jsonb) to service_role;
;

-- ===== NOSSOM 202610280001_zro_release.sql (sem o begin/commit do arquivo) =====
-- Lançamento fechado ao público (PRD §5, Etapa B, 28/10/2026): o vínculo com a Absolute ZRO guarda também a claim
-- `zro_release` = { "<product_id>": "released" | "closed" | "allowed" } do id_token (relida a cada login pela
-- Absolute ZRO). `allowed` = o NOSSOM está fechado, mas esta conta está na lista do proprietário; é a única que
-- entra enquanto RELEASE=closed. A decisão fica em lib/server/release.ts (`temAcesso`); aqui só se guarda.
alter table nossom_private.zro_links
  add column if not exists release jsonb not null default '{}'::jsonb;

create or replace function public.nossom_zro_link(
  p_action text,
  p_user uuid default null,
  p_sub text default null,
  p_data jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_row nossom_private.zro_links%rowtype;
  v_other nossom_private.zro_links%rowtype;
  v_email text := lower(trim(coalesce(p_data->>'email', '')));
  v_org text := nullif(left(trim(coalesce(p_data->>'organization', '')), 200), '');
  v_products text[] := coalesce(
    (select array_agg(left(value, 64)) from jsonb_array_elements_text(
      case when jsonb_typeof(p_data->'products') = 'array' then p_data->'products' else '[]'::jsonb end
    ) as t(value)),
    '{}'
  );
  -- Só os três estados, por produto; qualquer outra coisa é descartada.
  v_release jsonb := coalesce(
    (select jsonb_object_agg(left(key, 64), value)
       from jsonb_each_text(
         case when jsonb_typeof(p_data->'release') = 'object' then p_data->'release' else '{}'::jsonb end
       ) as r(key, value)
      where value in ('released', 'closed', 'allowed')),
    '{}'::jsonb
  );
begin
  -- EXECUTE só para service_role: o servidor da NOSSOM chama depois de conferir o id_token
  -- (assinatura, emissor, público, validade e nonce) ou a sessão da própria pessoa.
  if p_action = 'find' then
    if p_sub is null or p_sub = '' then raise exception 'Invalid subject'; end if;
    update nossom_private.zro_links set
      email = case when v_email = '' then email else v_email end,
      organization = v_org, products = v_products, release = v_release, last_login_at = now()
    where zro_sub = p_sub returning * into v_row;
    return jsonb_build_object('userId', v_row.user_id);
  end if;
  -- Conta `allowed` com e-mail confirmado no HUB: o servidor liga a conta NOSSOM antiga de mesmo e-mail (só ela,
  -- e só com e-mail confirmado aqui também). Para as demais, e-mail em uso nunca liga sozinho.
  if p_action = 'find_by_email' then
    if v_email = '' then raise exception 'Invalid email'; end if;
    return jsonb_build_object('userId', (
      select u.id from auth.users u
      where lower(u.email) = v_email and u.email_confirmed_at is not null
      order by u.created_at limit 1
    ));
  end if;
  if p_user is null or not exists(select 1 from auth.users where id = p_user) then
    raise exception 'Account required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('zro-link:' || p_user::text, 0));
  select * into v_row from nossom_private.zro_links where user_id = p_user;
  if p_action = 'get' then
    return jsonb_build_object('link', case when v_row.user_id is null then null else jsonb_build_object(
      'email', v_row.email, 'organization', v_row.organization, 'products', to_jsonb(v_row.products),
      'release', v_row.release,
      'createdByZro', v_row.created_by_zro, 'linkedAt', v_row.linked_at, 'lastLoginAt', v_row.last_login_at
    ) end);
  elsif p_action = 'link' then
    if p_sub is null or p_sub = '' or length(p_sub) > 255 or v_email = '' then
      raise exception 'Invalid link';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('zro-sub:' || p_sub, 0));
    select * into v_other from nossom_private.zro_links where zro_sub = p_sub;
    -- Uma pessoa ZRO já ligada a outra conta NOSSOM: nunca troca de dono sozinha.
    if v_other.user_id is not null and v_other.user_id <> p_user then
      return jsonb_build_object('error', 'other_account');
    end if;
    if v_row.user_id is not null and v_row.zro_sub <> p_sub then
      return jsonb_build_object('error', 'already_linked');
    end if;
    if v_row.user_id is null then
      insert into nossom_private.zro_links(user_id, zro_sub, email, organization, products, release, created_by_zro, last_login_at)
        values (p_user, p_sub, v_email, v_org, v_products, v_release, coalesce((p_data->>'createdByZro')::boolean, false),
          case when coalesce((p_data->>'createdByZro')::boolean, false) then now() end);
    else
      update nossom_private.zro_links set email = v_email, organization = v_org, products = v_products, release = v_release
        where user_id = p_user;
    end if;
    return jsonb_build_object('ok', true);
  elsif p_action = 'unlink' then
    if v_row.user_id is null then return jsonb_build_object('ok', true); end if;
    -- Conta sem senha ficaria sem como entrar.
    if v_row.created_by_zro then return jsonb_build_object('error', 'only_login'); end if;
    delete from nossom_private.zro_links where user_id = p_user;
    return jsonb_build_object('ok', true);
  end if;
  raise exception 'Invalid action';
end;
$$;
revoke all on function public.nossom_zro_link(text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.nossom_zro_link(text, uuid, text, jsonb) to service_role;
;

-- ===== NOSSOM: bucket das fotos de perfil (criado à mão no banco antigo; o da restauração vem da migration acima)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nossom-avatars', 'nossom-avatars', false, 307200, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- ===== Carro do Freela: tabelas antigas (lista de convite e contagem anônima) =====
-- Não há migration delas no repositório: reconstruídas do catálogo do banco antigo (dono postgres, anon só insere).
-- A migration nova products/carro-do-freela/db/migrations/0000_fundacao.sql NÃO entra aqui: ela ainda não foi
-- aplicada no banco antigo e roda depois pelo migrador do Carro (db/migrar.js), como estava planejado.
set local search_path to "$user", public, extensions;
create table carro_do_freela.cadastros (
  id bigint generated by default as identity primary key,
  quando timestamptz not null default now(),
  quem text not null,
  lado text,
  nome text,
  praca text,
  funcoes text[],
  contato text not null,
  versao text
);
create table carro_do_freela.leads (
  id bigint generated by default as identity primary key,
  criado_em timestamptz not null default now(),
  lado text not null check (lado = any (array['freela'::text, 'contratante'::text])),
  nome text not null,
  whatsapp text not null,
  praca text not null,
  funcao text,
  tipo_negocio text,
  jobs_mes text,
  aceite_contato boolean not null,
  aceite_publicacao boolean,
  dias_livres text[]
);
create table carro_do_freela.passos (
  id bigint generated by default as identity primary key,
  quando timestamptz not null default now(),
  quem text not null,
  passo text not null,
  lado text,
  volta boolean,
  versao text
);
alter table carro_do_freela.cadastros enable row level security;
alter table carro_do_freela.leads enable row level security;
alter table carro_do_freela.passos enable row level security;
create policy insercao_publica on carro_do_freela.cadastros for insert to anon with check (true);
create policy insercao_publica on carro_do_freela.leads for insert to anon with check (true);
create policy insercao_publica on carro_do_freela.passos for insert to anon with check (true);
revoke all on carro_do_freela.cadastros, carro_do_freela.leads, carro_do_freela.passos from anon, authenticated, service_role;
grant insert on carro_do_freela.cadastros, carro_do_freela.leads, carro_do_freela.passos to anon;

create view public.cadastros with (security_invoker = true) as
  select id, quando, quem, lado, nome, praca, funcoes, contato, versao from carro_do_freela.cadastros;
create view public.leads with (security_invoker = true) as
  select id, criado_em, lado, nome, whatsapp, praca, funcao, tipo_negocio, jobs_mes, aceite_contato, aceite_publicacao, dias_livres
  from carro_do_freela.leads;
create view public.passos with (security_invoker = true) as
  select id, quando, quem, passo, lado, volta, versao from carro_do_freela.passos;
revoke all on public.cadastros, public.leads, public.passos from anon, authenticated;
grant insert on public.cadastros, public.leads, public.passos to anon;

select 'ok: passo 2e feito. A estrutura está completa: rode o 04-conferir-estrutura.sql aqui e no ANTIGO.' as resultado;
