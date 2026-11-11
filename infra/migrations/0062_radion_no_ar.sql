-- Absolute ZRO HUB · 0062 · o RADION abre para todo mundo (decisão do titular, 07/11/2026: "lançar para todos").
--
-- - zro.products: stage 'active' (sai do "Em breve"); o endereço radion.absolutezro.com e o login único já vêm da 0061.
-- - Gate (0018/0049): 'released' nos canais web (absolutezro.com/radio), sso (o login único do radion.absolutezro.com)
--   e api (as rotas /api/v1/radio). Sem app de computador próprio: desktop e download ficam fechados.
-- - Planos: o RADION entra em todo plano de pacote e no grátis (Zero, Órbita, Absoluto e os antigos), sem limites
--   próprios, como o Relay na 0032; o avulso de outro app não traz o RADION. Quem já assina (ou está no Zero) ganha o
--   RADION agora, no nível do plano.
-- - A lista de acesso (zro.product_release_access) fica como está: não atrapalha e guarda o histórico de quem testou.
-- Nenhum e-mail sai daqui: abrir o gate não manda aviso a ninguém. O projeto Vercel `radion` abre a página inicial com
-- RADION_SITE_ABERTO=1. Idempotente.

update zro.products
   set stage = 'active'
 where id = 'radio' and stage is distinct from 'active';

update zro.product_release
   set state = 'released', web = true, sso = true, api = true, desktop = false, download = false,
       note = 'No ar para toda conta Absolute ZRO, no site e no login único; sem app de computador (titular, 07/11/2026).'
 where product_id = 'radio'
   and (state, web, sso, api, desktop, download) is distinct from ('released', true, true, true, false, false);

insert into zro.plan_products (plan_id, product_id, features, limits)
select p.id, 'radio', null, '{}'::jsonb
from zro.plans p
where p.kind in ('free', 'bundle')
on conflict (plan_id, product_id) do nothing;

insert into zro.entitlements (org_id, product_id, features, limits, source, source_id, starts_at, ends_at, nivel, legado)
select s.org_id, 'radio', null, '{}'::jsonb, 'subscription', s.id, now(),
       case when s.status = 'trialing' then s.current_period_end else null end, pl.nivel, pl.legado
from zro.subscriptions s
join zro.plans pl on pl.id = s.plan_id
where pl.kind in ('free', 'bundle')
  and s.status in ('active', 'trialing')
  and (s.current_period_end is null or s.current_period_end > now() or s.status = 'active')
  and not exists (
    select 1 from zro.entitlements e
    where e.org_id = s.org_id and e.product_id = 'radio' and e.status = 'active'
  );
