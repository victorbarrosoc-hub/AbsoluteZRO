-- Absolute ZRO HUB · 0065 · o CAMZRO (nome provisório: a câmera de vídeo do set) entra no catálogo, FECHADO.
-- Pedido do titular em 09/11/2026: construir a câmera, sem publicar ainda (nada de Vercel por enquanto).
--
-- - Catálogo: `camzro` nasce `coming_soon`, com nome provisório, sem endereço, fora de todo plano (nada de preço ou
--   plano mostrando app não lançado). A câmera roda inteira no aparelho: não gasta quota do HUB.
-- - Gate (0018/0049): `development`, todos os canais fechados. Não lançado: só o papel de plataforma `admin` (e a lista
--   de acesso) entra, pela claim zro_release que o login único manda ao app. Lançar é outra migration, com o titular.
-- - O cliente OIDC `camzro-web` se cadastra no console quando o titular ligar o domínio (o segredo nunca entra em
--   arquivo). Idempotente.

insert into zro.products (id, name, stage, step_order, role_in_flow, description, integration_mode, external_url, provisional_name) values
  ('camzro', 'CAMZRO', 'coming_soon', 12, 'A câmera de vídeo do set',
   'Câmera profissional no navegador do celular: exposição manual, falsa cor, zebra, foco, scopes, timecode, claquete e descarga conferida.',
   'api_adapter', null, true)
on conflict (id) do nothing;

insert into zro.product_release (product_id, state, web, desktop, api, download, sso, note)
values ('camzro', 'development', false, false, false, false, false,
        'Não lançado: fora de toda tela para o público. A administração da plataforma vê e usa.')
on conflict (product_id) do nothing;
