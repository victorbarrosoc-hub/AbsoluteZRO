-- Absolute ZRO HUB · 0031 · o Relay entra no catálogo (ADR 0030; decisão do titular, 29/10/2026).
-- Plataforma nova em products/relay: conversão e exportação de vídeo e áudio, no navegador e no computador.
-- Grátis: entra em todo plano vigente (inclusive a conta grátis), sem limites: converter no aparelho não consome
-- quota (nenhum custo de servidor).
-- Nasce fechado: stage 'coming_soon' e o gate (0018) em 'development' até o titular autorizar o projeto Vercel e o
-- domínio relay.absolutezro.com; aí uma migration nova abre (stage, external_url e product_release).
-- step_order 9: o Relay atravessa o fluxo (exporta de qualquer etapa) e fica por último na ordem do catálogo.

insert into zro.products (id, name, stage, step_order, role_in_flow, description, integration_mode, external_url, provisional_name) values
  ('relay', 'Relay', 'coming_soon', 9, 'Conversão e exportação de vídeo e áudio para cada destino',
   'Grátis. YouTube, Reels, TikTok, WhatsApp, Vimeo, Apple, tamanho máximo e áudio (MP3, AAC, WAV), com presets próprios e ficha técnica. Converte no aparelho, sem enviar o arquivo.',
   'api_adapter', null, false)
on conflict (id) do nothing;

insert into zro.product_release (product_id, state, web, desktop, api, download, sso, note)
values ('relay', 'development', false, false, false, false, false, 'Em desenvolvimento; abre grátis quando o deploy for autorizado')
on conflict (product_id) do nothing;

-- Todo plano vigente (Completo, Pro, avulsos e a conta grátis) leva o Relay, sem limite: ele não tem nada medido
-- (converte no aparelho). Copiar os limites das outras somaria créditos de IA que o Relay não usa.
insert into zro.plan_products (plan_id, product_id, features, limits)
select p.id, 'relay', null, '{}'::jsonb
from zro.plans p
where p.status = 'active'
on conflict (plan_id, product_id) do nothing;
