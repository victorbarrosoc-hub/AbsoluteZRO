-- Absolute ZRO HUB · 0058 · o rádio do set entra no catálogo, fechado (ADR 0042; titular autorizou publicar para
-- testar, 05/11/2026). Nome provisório (`provisional_name`): o titular escolhe o definitivo; o id técnico `radio` fica.
--
-- - Catálogo: `radio` nasce `coming_soon`, sem endereço, fora de todo plano (nada de preço ou plano mostrando app não
--   lançado). Falar no rádio não gasta quota do HUB: a voz vai de aparelho para aparelho.
-- - Gate (0018/0049): `development`, todos os canais fechados. Não lançado: só o papel de plataforma `admin` (e a lista
--   de acesso) entra, pela claim zro_release que o login único manda ao app. Lançar é outra migration, com o titular.
-- - O cliente OIDC `radio-web` é cadastrado como os outros (o segredo nunca entra em arquivo; o banco guarda o sha256).
-- Idempotente.

insert into zro.products (id, name, stage, step_order, role_in_flow, description, integration_mode, external_url, provisional_name) values
  ('radio', 'Rádio do set', 'coming_soon', 11, 'Voz por botão para a equipe da diária',
   'Canais Geral e por função, segurar para falar, avisos de set e tela de cue, no navegador do celular.',
   'api_adapter', null, true)
on conflict (id) do nothing;

insert into zro.product_release (product_id, state, web, desktop, api, download, sso, note)
values ('radio', 'development', false, false, false, false, false,
        'Não lançado: fora de toda tela para o público (ADR 0042). A administração da plataforma vê e usa.')
on conflict (product_id) do nothing;
