-- Vendas (decisão do titular em 26/10/2026): Stripe, cada app avulso + Absolute ZRO Completo, mensal ou anual
-- (anual = 10× o mensal), 7 dias de teste para conta nova, contas atuais seguem liberadas até uma data de corte.
-- Nada muda para ninguém até a administração ligar as vendas no console (zro.launch_sales).

-- Preços: avulso R$ 19,90/mês ou R$ 199/ano; Completo R$ 49,90/mês ou R$ 499/ano. Carência de 3 dias no atraso.
insert into zro.plans (code, version, name, kind, status, price_cents, currency, billing_interval, trial_days, grace_days, description) values
  ('ciclo-do-o', 2, 'Absolute ZRO Completo', 'bundle', 'active', 4990, 'BRL', 'month', 0, 3, 'Todas as ferramentas lançadas.'),
  ('ciclo-do-o-anual', 1, 'Absolute ZRO Completo', 'bundle', 'active', 49900, 'BRL', 'year', 0, 3, 'Todas as ferramentas lançadas, por um ano.'),
  ('individual-carro-do-freela', 2, 'Carro do Freela', 'individual', 'active', 1990, 'BRL', 'month', 0, 3, 'Somente Carro do Freela.'),
  ('individual-carro-do-freela-anual', 1, 'Carro do Freela', 'individual', 'active', 19900, 'BRL', 'year', 0, 3, 'Somente Carro do Freela, por um ano.'),
  ('individual-tpeasy', 2, 'TPeasy', 'individual', 'active', 1990, 'BRL', 'month', 0, 3, 'Somente TPeasy.'),
  ('individual-tpeasy-anual', 1, 'TPeasy', 'individual', 'active', 19900, 'BRL', 'year', 0, 3, 'Somente TPeasy, por um ano.'),
  ('individual-sobedesce', 2, 'SOBEDESCE', 'individual', 'active', 1990, 'BRL', 'month', 0, 3, 'Somente SOBEDESCE.'),
  ('individual-sobedesce-anual', 1, 'SOBEDESCE', 'individual', 'active', 19900, 'BRL', 'year', 0, 3, 'Somente SOBEDESCE, por um ano.'),
  ('individual-synquei', 2, 'Synquei', 'individual', 'active', 1990, 'BRL', 'month', 0, 3, 'Somente Synquei.'),
  ('individual-synquei-anual', 1, 'Synquei', 'individual', 'active', 19900, 'BRL', 'year', 0, 3, 'Somente Synquei, por um ano.'),
  ('individual-nossom', 2, 'NOSSOM', 'individual', 'active', 1990, 'BRL', 'month', 0, 3, 'Somente NOSSOM.'),
  ('individual-nossom-anual', 1, 'NOSSOM', 'individual', 'active', 19900, 'BRL', 'year', 0, 3, 'Somente NOSSOM, por um ano.'),
  -- Conta grátis depois das vendas: identidade, painel e catálogo, sem ferramentas. Entra no ar com zro.launch_sales.
  ('conta-absolute-zro', 3, 'Conta Absolute ZRO', 'free', 'draft', null, null, null, null, 0, 'Identidade, painel e catálogo.')
on conflict (code, version) do nothing;

-- Mesmas ferramentas da versão anterior de cada plano.
insert into zro.plan_products (plan_id, product_id, features, limits)
select n.id, pp.product_id, pp.features, pp.limits
from zro.plans n
join zro.plans o on o.code = regexp_replace(n.code, '-anual$', '') and o.version = 1
join zro.plan_products pp on pp.plan_id = o.id
where n.code in (
  'ciclo-do-o', 'ciclo-do-o-anual', 'individual-carro-do-freela', 'individual-carro-do-freela-anual', 'individual-tpeasy',
  'individual-tpeasy-anual', 'individual-sobedesce', 'individual-sobedesce-anual', 'individual-synquei',
  'individual-synquei-anual', 'individual-nossom', 'individual-nossom-anual'
) and ((n.code like '%-anual' and n.version = 1) or (n.code not like '%-anual' and n.version = 2))
on conflict (plan_id, product_id) do nothing;

-- As versões sem preço saem da vitrine; quem já tem uma continua com ela (webhook e entitlements aceitam 'retired').
update zro.plans set status = 'retired'
where version = 1 and status = 'active' and code in ('ciclo-do-o', 'individual-carro-do-freela', 'individual-tpeasy', 'individual-sobedesce', 'individual-synquei', 'individual-nossom');

-- Ajustes da plataforma lidos por funções do banco. Só o sistema lê e grava (sem grant para zro_app).
create table if not exists zro.platform_settings (
  key text primary key check (key ~ '^[a-z0-9_.-]+$'),
  value jsonb not null,
  updated_by uuid references zro.users (id),
  updated_at timestamptz not null default now()
);
alter table zro.platform_settings enable row level security;
revoke all on zro.platform_settings from public;

-- Conta nova: plano grátis vigente e, com as vendas ligadas, o teste do Completo (sem cartão, provider 'trial').
-- Idempotente como antes: organização que já tem qualquer assinatura não recebe outra.
create or replace function zro.start_free_plan(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_plan uuid;
  v_sub uuid;
  v_trial jsonb;
  v_days int;
begin
  if exists (select 1 from zro.subscriptions s where s.org_id = p_org) then
    return;
  end if;
  select p.id into v_plan from zro.plans p
  where p.code = 'conta-absolute-zro' and p.kind = 'free' and p.status = 'active'
  order by p.version desc limit 1;
  if v_plan is not null then
    insert into zro.subscriptions (org_id, plan_id, status, current_period_start, provider, provider_subscription_id, provider_updated_at)
      values (p_org, v_plan, 'active', now(), 'free', 'free-' || p_org::text, now())
      returning id into v_sub;
    insert into zro.entitlements (org_id, product_id, features, limits, source, source_id, starts_at)
      select p_org, pp.product_id, pp.features, pp.limits, 'subscription', v_sub, now()
      from zro.plan_products pp join zro.products pr on pr.id = pp.product_id
      where pp.plan_id = v_plan and pr.stage in ('active', 'beta');
  end if;

  select s.value into v_trial from zro.platform_settings s where s.key = 'signup_trial';
  v_days := coalesce((v_trial ->> 'days')::int, 0);
  if v_days <= 0 then
    return;
  end if;
  select p.id into v_plan from zro.plans p
  where p.code = v_trial ->> 'plan_code' and p.status = 'active'
  order by p.version desc limit 1;
  if v_plan is null then
    return;
  end if;
  insert into zro.subscriptions (org_id, plan_id, status, current_period_start, current_period_end, provider, provider_subscription_id, provider_updated_at)
    values (p_org, v_plan, 'trialing', now(), now() + make_interval(days => v_days), 'trial', 'trial-' || p_org::text, now())
    returning id into v_sub;
  insert into zro.entitlements (org_id, product_id, features, limits, source, source_id, starts_at, ends_at)
    select p_org, pp.product_id, pp.features, pp.limits, 'subscription', v_sub, now(), now() + make_interval(days => v_days)
    from zro.plan_products pp join zro.products pr on pr.id = pp.product_id
    where pp.plan_id = v_plan and pr.stage in ('active', 'beta');
end
$$;
revoke all on function zro.start_free_plan(uuid) from public;
