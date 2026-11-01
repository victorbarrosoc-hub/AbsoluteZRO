-- Absolute ZRO HUB · 0053 · NOSSOM passa a se chamar Quasar Audio Lab, em quasar.absolutezro.com (pedido do titular,
-- 01/11/2026: "é subproduto, todos são Absolute ZRO"; ADR 0025: o app mora em <app>.absolutezro.com).
-- Muda o nome de exibição e o endereço. O id do produto (`nossom`), o cliente OIDC, o schema e as chaves seguem os
-- mesmos, para nenhuma conta, cota ou projeto se perder. O retorno antigo continua aceito: nossom.absolutezro.com passa
-- a redirecionar para o endereço novo, e o app de computador e os links salvos ainda o usam. Segue fechado (0049).
update zro.oauth_clients
   set redirect_uris = array_append(redirect_uris, 'https://quasar.absolutezro.com/api/zro/callback')
 where id = 'nossom-web'
   and not ('https://quasar.absolutezro.com/api/zro/callback' = any (redirect_uris));

update zro.products
   set name = 'Quasar Audio Lab',
       external_url = 'https://quasar.absolutezro.com',
       sso_start_url = 'https://quasar.absolutezro.com/api/zro/entrar'
 where id = 'nossom';
