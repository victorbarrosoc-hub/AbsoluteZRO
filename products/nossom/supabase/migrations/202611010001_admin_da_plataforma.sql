begin;
-- ADM do NOSSOM = admin da plataforma Absolute ZRO (decisão do titular, 01/11/2026). Antes, as funções reconheciam o
-- ADM por um e-mail fixo; agora o servidor guarda no vínculo a claim `zro_admin` do id_token já conferido (papel admin,
-- conta ativa e e-mail confirmado no HUB, zro.release_admin), relida a cada login pela Absolute ZRO, e toda função usa
-- nossom_private.is_admin. Sem vínculo, ninguém é ADM. Os corpos abaixo são os das migrações anteriores, só com a
-- troca da regra do ADM (e o vínculo guardando o `admin`).
alter table nossom_private.zro_links
  add column if not exists platform_admin boolean not null default false;

-- ADM: vínculo com a Absolute ZRO marcado como admin da plataforma e e-mail confirmado aqui também.
create or replace function nossom_private.is_admin(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user is not null and exists (
    select 1 from nossom_private.zro_links l join auth.users u on u.id = l.user_id
    where l.user_id = p_user and l.platform_admin and u.email_confirmed_at is not null)
$$;
revoke all on function nossom_private.is_admin(uuid) from public, anon, authenticated;

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
  -- Claim `zro_admin` do id_token já conferido no servidor; qualquer outra coisa é falso.
  v_admin boolean := case when jsonb_typeof(p_data->'admin') = 'boolean' then (p_data->>'admin')::boolean else false end;
begin
  -- EXECUTE só para service_role: o servidor da NOSSOM chama depois de conferir o id_token
  -- (assinatura, emissor, público, validade e nonce) ou a sessão da própria pessoa.
  if p_action = 'find' then
    if p_sub is null or p_sub = '' then raise exception 'Invalid subject'; end if;
    update nossom_private.zro_links set
      email = case when v_email = '' then email else v_email end,
      organization = v_org, products = v_products, release = v_release, platform_admin = v_admin, last_login_at = now()
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
      'release', v_row.release, 'admin', v_row.platform_admin,
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
      insert into nossom_private.zro_links(user_id, zro_sub, email, organization, products, release, platform_admin, created_by_zro, last_login_at)
        values (p_user, p_sub, v_email, v_org, v_products, v_release, v_admin, coalesce((p_data->>'createdByZro')::boolean, false),
          case when coalesce((p_data->>'createdByZro')::boolean, false) then now() end);
    else
      update nossom_private.zro_links set email = v_email, organization = v_org, products = v_products, release = v_release,
        platform_admin = v_admin
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
  select nossom_private.is_admin(u.id) into v_admin from auth.users u where u.id = v_user;
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

create or replace function public.nossom_plan_usage(p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid(); v_admin boolean; v_plan nossom_private.plans%rowtype;
  v_member nossom_private.memberships%rowtype; v_job nossom_private.restoration_jobs%rowtype;
  v_start timestamptz:=date_trunc('month',now() at time zone 'America/Fortaleza') at time zone 'America/Fortaleza';
  v_reset timestamptz; v_used integer; v_limit integer; v_existing boolean:=false; v_allowed boolean;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select nossom_private.is_admin(id) into v_admin from auth.users where id=v_user;
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

create or replace function public.nossom_admin(p_action text default 'dashboard',p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid(); v_target uuid; v_plan text; v_seconds integer; v_price integer;
  v_name text; v_expires timestamptz; v_override integer; v_blocked boolean;
  v_period timestamptz:=date_trunc('month',now() at time zone 'America/Fortaleza') at time zone 'America/Fortaleza';
  v_users jsonb; v_days jsonb; v_total integer; v_search text:=left(coalesce(p_data->>'search',''),100);
  v_page integer:=greatest(0,least(10000,coalesce((p_data->>'page')::integer,0)));
begin
  if not nossom_private.is_admin(v_actor) then raise exception 'Admin required' using errcode='42501'; end if;
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
      nossom_private.is_admin(u.id) as is_admin,
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

create or replace function public.nossom_ai_session()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid(); v_admin boolean; v_day date := (now() at time zone 'America/Fortaleza')::date;
  v_limit constant integer := 40; v_used integer;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select nossom_private.is_admin(id) into v_admin from auth.users where id = v_user;
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
commit;
