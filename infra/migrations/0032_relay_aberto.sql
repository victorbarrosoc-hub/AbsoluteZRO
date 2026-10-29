-- Absolute ZRO HUB · 0032 · o Relay abre para todo mundo (decisão do titular, 29/10/2026: "pode liberar o acesso ao
-- Relay e ao Maestro aos usuários, mas não manda os emails"). Lançado junto com o Maestro.
--
-- - zro.products: stage 'active' e o endereço relay.absolutezro.com (o projeto Vercel `relay` sai do "Em breve" com
--   RELEASE=released).
-- - Gate (0018): 'released' só no canal web. O Relay ainda não tem login único (sso), app de computador próprio
--   (desktop/download) nem API (api): esses canais abrem quando existirem.
-- - Entitlement: quem já tem assinatura vigente ganha o Relay agora, sem limites (a 0031 já pôs nos planos).
-- Nenhum e-mail sai daqui: abrir o gate não manda aviso a ninguém.

update zro.products
   set stage = 'active',
       external_url = 'https://relay.absolutezro.com'
 where id = 'relay';

update zro.product_release
   set state = 'released', web = true, desktop = false, api = false, download = false, sso = false,
       note = 'Lançado com o Maestro (decisão do titular, 29/10/2026); só o site, sem e-mail de lançamento.'
 where product_id = 'relay';

insert into zro.entitlements (org_id, product_id, features, limits, source, source_id, starts_at, ends_at)
select s.org_id, pp.product_id, pp.features, pp.limits, 'subscription', s.id, now(),
       case when s.status = 'trialing' then s.current_period_end else null end
from zro.subscriptions s
join zro.plan_products pp on pp.plan_id = s.plan_id
where pp.product_id = 'relay'
  and s.status in ('active', 'trialing')
  and (s.current_period_end is null or s.current_period_end > now() or s.status = 'active')
  and not exists (
    select 1 from zro.entitlements e
    where e.org_id = s.org_id and e.product_id = 'relay' and e.status = 'active'
  );
