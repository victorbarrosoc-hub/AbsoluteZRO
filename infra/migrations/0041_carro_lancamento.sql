-- Absolute ZRO HUB · 0041 · o Carro do Freela no ar (o titular autorizou preparar o lançamento, 30/10/2026: "pode fazer
-- o restante"; e-mail só quando ele pedir). Checklist e reversão: docs/operations/lancamento-carro.md.
--
-- - Catálogo: stage 'beta' → 'active' (sem selo "Beta"), endereço no subdomínio da Absolute ZRO (carro.absolutezro.com,
--   no ar desde a 0037; carrodofreela.com.br continua valendo como endereço antigo), início do login único e a
--   descrição de agora (sai o "protótipo com partes simuladas": o site real não leva nenhum perfil fictício).
-- - Gate (0018): 'released' com web, api e sso abertos ao público. Desktop e download FECHADOS: o Carro é só da web
--   (abrir um app de computador seria uma migration nova).
-- - Planos: nada muda. O Carro já está no grátis vigente (conta-absolute-zro v2, 0007, com os créditos de IA da 0020),
--   no Completo e no Pro (mensal e anual, 0011) e nos avulsos dele. Mesmo modelo que o Maestro ganhou na 0027 e o
--   Relay na 0031: toda conta usa, com os créditos de IA que o plano já dá.
-- - Entitlements: quem tem assinatura vigente desses planos e ainda não tem o Carro ativo passa a ter (mesma janela de
--   subscriptionWindow, como na 0027). Hoje quase todos já têm: o Carro estava em 'beta', e o start_free_plan dá as
--   ferramentas 'active'/'beta'.
-- - A lista de acesso interno (product_release_access) fica como está: com o gate aberto ela deixa de ser necessária.
-- Nenhum e-mail sai daqui. Idempotente: rodar de novo não muda nada nem gera nova linha de auditoria.
-- O lado do Carro (projeto Vercel `carrodofreela-app`) abre com CARRO_RELEASE=released, que é passo do titular.

update zro.products
   set stage = 'active',
       external_url = 'https://carro.absolutezro.com',
       sso_start_url = 'https://carro.absolutezro.com/api/zro/entrar',
       description = 'A agenda do audiovisual: quem está livre na data certa, com a sua conta Absolute ZRO.'
 where id = 'carro-do-freela'
   and (stage, external_url, sso_start_url, description) is distinct from
       ('active', 'https://carro.absolutezro.com', 'https://carro.absolutezro.com/api/zro/entrar',
        'A agenda do audiovisual: quem está livre na data certa, com a sua conta Absolute ZRO.');

insert into zro.product_release (product_id, state, web, desktop, api, download, sso, note)
select p.id, 'released', true, false, true, false, true, 'No ar para toda conta Absolute ZRO (titular, 30/10/2026); só na web.'
from zro.products p where p.id = 'carro-do-freela'
on conflict (product_id) do update
  set state = excluded.state, web = excluded.web, desktop = excluded.desktop, api = excluded.api,
      download = excluded.download, sso = excluded.sso, note = excluded.note
  where (zro.product_release.state, zro.product_release.web, zro.product_release.desktop, zro.product_release.api,
         zro.product_release.download, zro.product_release.sso)
        is distinct from (excluded.state, excluded.web, excluded.desktop, excluded.api, excluded.download, excluded.sso);

-- Quem já tem assinatura vigente de um plano com o Carro passa a ter o Carro agora (o recálculo seguinte refaz igual).
-- A janela de cada assinatura é a de subscriptionWindow (packages/billing/src/entitlements.ts), como na 0027.
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
join zro.plan_products pp on pp.plan_id = w.plan_id and pp.product_id = 'carro-do-freela'
where (w.fim is null or w.fim > now())
  and not exists (
    select 1 from zro.entitlements e
    where e.org_id = w.org_id and e.product_id = 'carro-do-freela' and e.status = 'active'
      and e.source = 'subscription' and e.source_id = w.id
  );
