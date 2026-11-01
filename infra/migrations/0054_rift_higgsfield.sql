-- Absolute ZRO HUB · 0054 · o Rift Motion entra no catálogo para usar a Higgsfield das Conexões (pedido do titular,
-- 01/11/2026: "entra o Higgsfield na central mesmo, aí vale pra qualquer plataforma"). O Rift deixa a conexão própria
-- com a Higgsfield e gera imagem e vídeo pela API /api/v1/higgsfield (0052), que só atende app do catálogo.
--
-- - Catálogo: `rift-motion` nasce `coming_soon`, sem endereço (como o Relay na 0031). Converter e animar no aparelho
--   não gasta quota do HUB; a Higgsfield cobra do plano da pessoa. Fica fora dos planos até o lançamento (nada de
--   preço ou plano mostrando app não lançado).
-- - Gate (0018/0049): `development`, todos os canais fechados. Não lançado: só o papel de plataforma `admin` entra
--   (zro.release_allows). Lançar é outra migration, com o titular.
-- - Cliente `rift-web`: passa a ser o app `rift-motion` (o login único e a API conferem o gate dele) e ganha o escopo
--   `zro.higgsfield`. Idempotente.

insert into zro.products (id, name, stage, step_order, role_in_flow, description, integration_mode, external_url, provisional_name) values
  ('rift-motion', 'Rift Motion', 'coming_soon', 10, 'Motion design 2D e 3D',
   'Estúdio de motion design 2D e 3D no navegador e no computador, com animação por IA pela Higgsfield da pessoa.',
   'api_adapter', null, false)
on conflict (id) do nothing;

insert into zro.product_release (product_id, state, web, desktop, api, download, sso, note)
values ('rift-motion', 'development', false, false, false, false, false,
        'Não lançado: fora de toda tela para o público (titular, 01/11/2026). A administração da plataforma vê e usa.')
on conflict (product_id) do nothing;

update zro.oauth_clients
   set product_id = 'rift-motion',
       scopes = case when 'zro.higgsfield' = any (scopes) then scopes else scopes || array['zro.higgsfield'] end
 where id = 'rift-web'
   and (product_id is distinct from 'rift-motion' or not ('zro.higgsfield' = any (scopes)));
