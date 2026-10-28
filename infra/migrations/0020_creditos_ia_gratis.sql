-- Absolute ZRO HUB · 0020 · 50 créditos de IA por mês no plano grátis (decisão do titular, 28/10/2026).
-- Antes a conta grátis nascia sem limite de zro.ai_credits e, pela regra "sem limite configurado = bloqueado", a Z
-- dizia que os créditos tinham acabado. O limite vale por organização (consumeQuota lê o maior limite entre os
-- entitlements ativos). Mudar o valor depois: nova versão do plano no console, nunca editar esta migration.

-- O plano grátis vigente passa a trazer os 50 créditos em cada ferramenta que inclui.
update zro.plan_products pp
   set limits = pp.limits || '{"zro.ai_credits": 50}'::jsonb
  from zro.plans p
 where p.id = pp.plan_id
   and p.code = 'conta-absolute-zro' and p.kind = 'free' and p.status = 'active'
   and not (pp.limits ? 'zro.ai_credits');

-- Contas que já existem no grátis ganham o mesmo limite nos entitlements da assinatura grátis (idempotente).
update zro.entitlements e
   set limits = e.limits || '{"zro.ai_credits": 50}'::jsonb
  from zro.subscriptions s
  join zro.plans p on p.id = s.plan_id
 where e.source = 'subscription' and e.source_id = s.id and e.status = 'active'
   and p.code = 'conta-absolute-zro' and p.kind = 'free'
   and not (e.limits ? 'zro.ai_credits');
