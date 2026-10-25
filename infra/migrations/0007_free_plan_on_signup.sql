-- Absolute ZRO HUB · 0007 · toda organização nova começa no plano grátis (pedido do titular em 25/10/2026).
-- A conta nasce na Absolute ZRO; o que ela pode usar nos apps vem do admin: o plano grátis "conta-absolute-zro"
-- (a versão ativa mais nova) define as ferramentas de quem acabou de chegar, e o console concede ou retira o resto.
-- A v2 inclui as ferramentas lançadas, para os apps continuarem abertos a quem já usava. Mudar o padrão = nova
-- versão do plano no console; quem já tem a assinatura fica na versão que recebeu.

insert into zro.plans (code, version, name, kind, status, description) values
  ('conta-absolute-zro', 2, 'Conta Absolute ZRO', 'free', 'active', 'Identidade, painel e as ferramentas liberadas para toda conta nova.')
on conflict (code, version) do nothing;

insert into zro.plan_products (plan_id, product_id)
select p.id, x.product_id
from zro.plans p
join (values ('carro-do-freela'), ('tpeasy'), ('sobedesce'), ('synquei'), ('nossom')) as x (product_id) on true
where p.code = 'conta-absolute-zro' and p.version = 2
on conflict (plan_id, product_id) do nothing;

update zro.plans set status = 'retired' where code = 'conta-absolute-zro' and version = 1 and status = 'active';

-- Assina o plano grátis vigente e cria os entitlements dele (mesma regra de recomputeEntitlements: só ferramentas
-- lançadas). Idempotente: organização que já tem qualquer assinatura não recebe outra.
create or replace function zro.start_free_plan(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_plan uuid;
  v_sub uuid;
begin
  if exists (select 1 from zro.subscriptions s where s.org_id = p_org) then
    return;
  end if;
  select p.id into v_plan from zro.plans p
  where p.code = 'conta-absolute-zro' and p.kind = 'free' and p.status = 'active'
  order by p.version desc limit 1;
  if v_plan is null then
    return;
  end if;
  insert into zro.subscriptions (org_id, plan_id, status, current_period_start, provider, provider_subscription_id, provider_updated_at)
    values (p_org, v_plan, 'active', now(), 'free', 'free-' || p_org::text, now())
    returning id into v_sub;
  insert into zro.entitlements (org_id, product_id, features, limits, source, source_id, starts_at)
    select p_org, pp.product_id, pp.features, pp.limits, 'subscription', v_sub, now()
    from zro.plan_products pp join zro.products pr on pr.id = pp.product_id
    where pp.plan_id = v_plan and pr.stage in ('active', 'beta');
end
$$;
revoke all on function zro.start_free_plan(uuid) from public;

create or replace function zro.create_organization(p_name text, p_slug text, p_kind text default 'team') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := zro.current_user_id();
  v_org uuid;
begin
  if v_user is null or not exists (select 1 from zro.users u where u.id = v_user and u.status = 'active') then
    raise exception 'Entre na sua conta para criar uma organização.' using errcode = '28000';
  end if;
  insert into zro.organizations (name, slug, kind, owner_id) values (btrim(p_name), p_slug, p_kind, v_user) returning id into v_org;
  insert into zro.memberships (org_id, user_id, role) values (v_org, v_user, 'owner');
  insert into zro.audit_logs (org_id, actor_user_id, action, target_type, target_id)
    values (v_org, v_user, 'organization.created', 'organization', v_org::text);
  perform zro.start_free_plan(v_org);
  return v_org;
end
$$;

-- Organizações que já existiam e nunca tiveram assinatura entram no plano grátis agora.
select zro.start_free_plan(o.id) from zro.organizations o
where o.status = 'active' and not exists (select 1 from zro.subscriptions s where s.org_id = o.id);
