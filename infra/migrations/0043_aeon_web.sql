-- Absolute ZRO HUB · 0043 · o AEON no ar na web (decisão do titular, 31/10/2026: "pode subir no web, não faz a versão
-- de computador ainda"). Roteiro e reversão: docs/operations/lancamento-aeon.md.
--
-- - Gate (0018): 'released' com web, api e sso abertos a qualquer conta. Desktop e download FECHADOS: o app de computador
--   abre numa migration própria quando o titular pedir (como o Maestro na 0039 e o Carro na 0041 antes da 0042). Do lado
--   do site, o projeto Vercel `aeon` precisa de RELEASE=released (os dois lados, PRD §5–§6).
-- - Catálogo: 'active' em aeon.absolutezro.com (0013), com o início do login único (já gravado em produção; aqui fica
--   na migration) e a descrição do editor de hoje (velocidade com câmera lenta por fluxo óptico e estabilização).
-- - Planos: nada muda. O AEON já está no grátis vigente, no Completo e no Pro (0013). Quem tem assinatura vigente desses
--   planos e ainda não tem o AEON ativo passa a ter (o mesmo bloco da 0041).
-- Idempotente: rodar de novo não muda nada nem gera nova linha de auditoria (o update só pega quem está diferente).

update zro.products
   set stage = 'active',
       external_url = 'https://aeon.absolutezro.com',
       sso_start_url = 'https://aeon.absolutezro.com/api/zro/entrar',
       description = 'Editor de vídeo completo: linha do tempo, velocidade com câmera lenta por fluxo óptico, estabilização, legenda e exportação para o seu editor, com IA quando você quiser.'
 where id = 'ai-edit'
   and (stage, external_url, sso_start_url, description) is distinct from
       ('active', 'https://aeon.absolutezro.com', 'https://aeon.absolutezro.com/api/zro/entrar',
        'Editor de vídeo completo: linha do tempo, velocidade com câmera lenta por fluxo óptico, estabilização, legenda e exportação para o seu editor, com IA quando você quiser.');

insert into zro.product_release (product_id, state, web, desktop, api, download, sso, note)
select p.id, 'released', true, false, true, false, true, 'No ar na web para toda conta Absolute ZRO (titular, 31/10/2026); app de computador depois.'
from zro.products p where p.id = 'ai-edit'
on conflict (product_id) do update
  set state = excluded.state, web = excluded.web, desktop = excluded.desktop, api = excluded.api,
      download = excluded.download, sso = excluded.sso, note = excluded.note
  where (zro.product_release.state, zro.product_release.web, zro.product_release.desktop, zro.product_release.api,
         zro.product_release.download, zro.product_release.sso)
        is distinct from (excluded.state, excluded.web, excluded.desktop, excluded.api, excluded.download, excluded.sso);

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
join zro.plan_products pp on pp.plan_id = w.plan_id and pp.product_id = 'ai-edit'
where (w.fim is null or w.fim > now())
  and not exists (
    select 1 from zro.entitlements e
    where e.org_id = w.org_id and e.product_id = 'ai-edit' and e.status = 'active'
      and e.source = 'subscription' and e.source_id = w.id
  );
