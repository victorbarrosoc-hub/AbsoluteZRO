-- Absolute ZRO HUB · 0027 · o Maestro abre para todos em Beta grátis (decisão do titular; vale quando ele der o OK final).
-- Substitui a proposta antiga `0022_maestro_aberto.sql` (nunca publicada; o número foi usado por outra migration).
-- Checklist e reversão: docs/operations/lancamento-maestro.md · ADR 0027.
--
-- - Catálogo: stage 'beta' (selo "Beta"), endereço público, início do login único e a descrição de agora.
-- - Gate (0018): 'public_beta' com web, api, sso, desktop e download abertos ao público. Desktop e download abrem
--   já porque o app de computador está a caminho; enquanto não houver instalador publicado, o HUB não mostra
--   download nenhum (lib/downloads.ts só lista o que existe) e a página do Maestro esconde a área.
-- - Planos: o Maestro entra no grátis vigente e nos pagos que dão todas as ferramentas (Completo e Pro, mensal e
--   anual), com os mesmos créditos de IA que o plano já dá às outras ferramentas (como a 0013 fez com AEON e Revela).
--   Sem cobrança: o Stripe não está configurado e o grátis é a porta. O avulso do Maestro não existe.
-- - Pro v2 (rascunho da 0025): a linha do Maestro deixa de ser só o sinal (features '{}') e passa a abrir o Maestro
--   inteiro (features null), mantendo o sinal `maestro.marca_propria`. O adicional "Maestro com a sua marca" continua
--   separado e em rascunho. O grátis NUNCA leva o sinal da marca própria.
-- - Contas atuais ganham o Maestro pela assinatura vigente (mesma janela de subscriptionWindow). Idempotente: rodar
--   de novo não duplica nada.
-- O cliente OIDC `maestro-web` NÃO está aqui: o segredo nunca entra no repositório (npm run db:client:maestro).

update zro.products
   set stage = 'beta',
       external_url = 'https://maestro.absolutezro.com',
       sso_start_url = 'https://maestro.absolutezro.com/api/zro/entrar',
       description = 'A gestão da sua produtora num lugar só: pauta, aprovação do cliente, orçamentos e financeiro.'
 where id = 'maestro' and stage in ('coming_soon', 'beta');

insert into zro.product_release (product_id, state, web, desktop, api, download, sso, note)
select p.id, 'public_beta', true, true, true, true, true, 'Beta grátis para toda conta Absolute ZRO (lançamento do Maestro, ADR 0027).'
from zro.products p where p.id = 'maestro'
on conflict (product_id) do update
  set state = excluded.state, web = excluded.web, desktop = excluded.desktop, api = excluded.api,
      download = excluded.download, sso = excluded.sso, note = excluded.note
  where (zro.product_release.state, zro.product_release.web, zro.product_release.desktop, zro.product_release.api,
         zro.product_release.download, zro.product_release.sso)
        is distinct from (excluded.state, excluded.web, excluded.desktop, excluded.api, excluded.download, excluded.sso);

-- Grátis, Completo e Pro vigentes: o Maestro inteiro, só com os créditos de IA que o plano já dá às outras ferramentas
-- (nenhum limite de outro produto, e nunca o sinal da marca própria).
insert into zro.plan_products (plan_id, product_id, features, limits)
select p.id, 'maestro', null,
       coalesce((select jsonb_strip_nulls(jsonb_build_object('zro.ai_credits', pp.limits -> 'zro.ai_credits'))
                   from zro.plan_products pp
                  where pp.plan_id = p.id and pp.product_id <> 'maestro' order by pp.product_id limit 1), '{}'::jsonb)
from zro.plans p
where p.status = 'active'
  and (p.code like 'ciclo-do-o%' or p.code like 'absolute-zro-pro%' or (p.kind = 'free' and p.code = 'conta-absolute-zro'))
on conflict (plan_id, product_id) do nothing;

-- Pro v2 (rascunho): o Maestro inteiro + os mesmos créditos + o sinal da marca própria.
update zro.plan_products pp
   set features = null,
       limits = coalesce((select jsonb_strip_nulls(jsonb_build_object('zro.ai_credits', o.limits -> 'zro.ai_credits'))
                             from zro.plan_products o
                            where o.plan_id = pp.plan_id and o.product_id <> 'maestro' order by o.product_id limit 1), '{}'::jsonb)
                || '{"maestro.marca_propria": 1}'::jsonb
  from zro.plans p
 where p.id = pp.plan_id and pp.product_id = 'maestro'
   and p.code in ('absolute-zro-pro', 'absolute-zro-pro-anual') and p.version = 2 and p.status = 'draft'
   and pp.features is not null;

-- Quem já tem assinatura vigente desses planos passa a ter o Maestro agora (o recálculo seguinte refaz igual).
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
