-- Absolute ZRO HUB · 0013 · AEON e Revela disponíveis (decisão do titular, 26/10/2026): os dois sites estão no ar
-- (aeon.absolutezro.com e revela.absolutezro.com) e entram em todo plano que já dá "todas as ferramentas".
-- Ids técnicos continuam 'ai-edit' e 'finishing'.

update zro.products set stage = 'active' where id in ('ai-edit', 'finishing') and stage = 'coming_soon';
update zro.products set external_url = 'https://aeon.absolutezro.com' where id = 'ai-edit' and external_url is null;
update zro.products set external_url = 'https://revela.absolutezro.com' where id = 'finishing' and external_url is null;
update zro.products
   set description = 'Edição com IA: transcrição, legenda, cortes e zoom propostos para aprovar e timeline para o seu editor.'
 where id = 'ai-edit' and description like 'Em desenvolvimento.%';
update zro.products
   set description = 'Cor no DaVinci Resolve: LUT criativa a partir de um frame de referência, LUTs por câmera e entregas por destino.'
 where id = 'finishing' and description like 'Em desenvolvimento.%';

-- Os planos vigentes que já levam todas as ferramentas (Completo, Pro e a conta grátis de hoje) ganham os dois, com os
-- mesmos limites que o plano dá às outras ferramentas (créditos de IA e GPU iguais).
insert into zro.plan_products (plan_id, product_id, features, limits)
select p.id, novo.id, null,
       coalesce((select pp.limits from zro.plan_products pp where pp.plan_id = p.id order by pp.product_id limit 1), '{}'::jsonb)
from zro.plans p
cross join (values ('ai-edit'), ('finishing')) as novo (id)
where p.status = 'active'
  and (p.code like 'ciclo-do-o%' or p.code like 'absolute-zro-pro%' or (p.kind = 'free' and p.code = 'conta-absolute-zro'))
on conflict (plan_id, product_id) do nothing;

-- Quem já tem assinatura vigente desses planos passa a ter os dois agora (o recálculo seguinte refaz igual).
insert into zro.entitlements (org_id, product_id, features, limits, source, source_id, starts_at, ends_at)
select s.org_id, pp.product_id, pp.features, pp.limits, 'subscription', s.id, now(),
       case when s.status = 'trialing' then s.current_period_end else null end
from zro.subscriptions s
join zro.plan_products pp on pp.plan_id = s.plan_id
where pp.product_id in ('ai-edit', 'finishing')
  and s.status in ('active', 'trialing')
  and (s.current_period_end is null or s.current_period_end > now() or s.status = 'active')
  and not exists (
    select 1 from zro.entitlements e
    where e.org_id = s.org_id and e.product_id = pp.product_id and e.status = 'active'
  );
