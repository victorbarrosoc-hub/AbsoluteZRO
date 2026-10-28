-- Absolute ZRO HUB · 0020 · o Maestro abre para todos em teste (decisão do titular, 28/10/2026).
-- Abre já com a fundação (etapa 0) para o titular configurar e testar com amigos, em https://maestro.absolutezro.com.
-- - Catálogo: stage 'beta' (aberto, com o selo "Beta"), endereço público e o início do login único (/api/zro/entrar).
-- - Gate de lançamento (0018): 'public_beta' com web, api e sso abertos ao público; desktop e download fechados (não
--   há app de computador).
-- - Planos: entra no grátis vigente e no Completo e no Pro (mensal e anual), sem limite novo. Avulso do Maestro: não.
-- - Contas atuais ganham o Maestro pela assinatura vigente (mesma janela de recomputeEntitlements). Idempotente.
-- O cliente OIDC `maestro-web` NÃO está aqui: o segredo nunca entra no repositório (npm run db:client:maestro).

update zro.products
   set stage = 'beta',
       external_url = 'https://maestro.absolutezro.com',
       sso_start_url = 'https://maestro.absolutezro.com/api/zro/entrar',
       description = 'Em teste aberto. Pauta e aprovação do cliente para agências e produtoras; os recursos chegam por etapas.'
 where id = 'maestro' and stage in ('coming_soon', 'beta');

insert into zro.product_release (product_id, state, web, desktop, api, download, sso, note)
select p.id, 'public_beta', true, false, true, false, true, 'Teste aberto a todos com a fundação (decisão do titular, 28/10/2026).'
from zro.products p where p.id = 'maestro'
on conflict (product_id) do update
  set state = excluded.state, web = excluded.web, desktop = excluded.desktop, api = excluded.api,
      download = excluded.download, sso = excluded.sso, note = excluded.note;

insert into zro.plan_products (plan_id, product_id, features, limits)
select p.id, 'maestro', null, '{}'::jsonb
from zro.plans p
where p.status = 'active'
  and (p.code like 'ciclo-do-o%' or p.code like 'absolute-zro-pro%' or (p.kind = 'free' and p.code = 'conta-absolute-zro'))
on conflict (plan_id, product_id) do nothing;

-- A janela de cada assinatura é a de subscriptionWindow (packages/billing/src/entitlements.ts).
insert into zro.entitlements (org_id, product_id, features, limits, source, source_id, starts_at, ends_at)
select w.org_id, pp.product_id, pp.features, pp.limits, 'subscription', w.id, w.inicio, w.fim
from (
  select s.id, s.org_id, s.plan_id, coalesce(s.current_period_start, s.created_at) as inicio,
         case s.status
           when 'past_due' then coalesce(s.grace_until, s.current_period_end)
           else s.current_period_end
         end as fim
  from zro.subscriptions s
  where s.status in ('active', 'trialing', 'past_due')
     or (s.status = 'canceled' and s.cancel_at_period_end and s.current_period_end is not null
         and (s.canceled_at is null or s.current_period_end > s.canceled_at))
) w
join zro.plan_products pp on pp.plan_id = w.plan_id and pp.product_id = 'maestro'
where (w.fim is null or w.fim > now())
  and not exists (
    select 1 from zro.entitlements e
    where e.org_id = w.org_id and e.product_id = 'maestro' and e.status = 'active'
      and e.source = 'subscription' and e.source_id = w.id
  );
