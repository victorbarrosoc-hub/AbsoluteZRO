-- Absolute ZRO HUB · 0065 · a plataforma de fotos entra no catálogo, fechada (ADR 0044; pedido do titular, 13/11/2026).
-- Nome provisório (`provisional_name`): LUXON. O titular escolhe o definitivo; o id técnico `foto` fica para sempre.
--
-- - Catálogo: `foto` nasce `coming_soon`, sem endereço, fora de todo plano (nada de preço, plano ou limite mostrando app
--   não lançado). Decupar, revelar e exportar rodam no aparelho da pessoa e não gastam quota do HUB.
-- - Gate (0018/0049): `development`, todos os canais fechados. Não lançado: só o papel de plataforma `admin` (e a lista
--   de acesso do titular) entra, pela claim zro_release que o login único manda ao app.
-- - Fica para depois, cada passo com o titular: o cliente OIDC `foto-web` (cadastrado no console, como os outros: o
--   segredo nunca entra em arquivo, o banco guarda o sha256); nome definitivo e endereço `<app>.absolutezro.com`
--   (migration nova, como a 0061); planos, limites por nível e lançamento (migration nova abrindo o gate, como a 0062).
-- Idempotente.

insert into zro.products (id, name, stage, step_order, role_in_flow, description, integration_mode, external_url, provisional_name) values
  ('foto', 'LUXON', 'coming_soon', 12, 'Seleção e tratamento de fotos',
   'Decupagem, revelação RAW e predefinições de fotos, no aparelho da pessoa, com seleção pelo cliente.',
   'api_adapter', null, true)
on conflict (id) do nothing;

insert into zro.product_release (product_id, state, web, desktop, api, download, sso, note)
values ('foto', 'development', false, false, false, false, false,
        'Não lançado: fora de toda tela para o público (ADR 0044). A administração da plataforma vê e usa.')
on conflict (product_id) do nothing;
