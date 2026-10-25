begin;
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
commit;
