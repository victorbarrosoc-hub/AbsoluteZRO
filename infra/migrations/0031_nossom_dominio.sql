-- Absolute ZRO HUB · 0031 · NOSSOM em nossom.absolutezro.com (ADR 0025; pedido do titular, 29/10/2026).
-- O domínio já está no projeto Vercel `nossom`. Numa mesma transação: o cliente OIDC passa a aceitar o retorno novo
-- (o antigo continua, porque o app de computador e links salvos ainda abrem nossom-teal.vercel.app) e o catálogo do HUB
-- passa a abrir o endereço novo. O redirecionamento do domínio antigo vem depois, quando o app de computador aceitar os
-- dois endereços.
update zro.oauth_clients
   set redirect_uris = array_append(redirect_uris, 'https://nossom.absolutezro.com/api/zro/callback')
 where id = 'nossom-web'
   and not ('https://nossom.absolutezro.com/api/zro/callback' = any (redirect_uris));

update zro.products
   set external_url = 'https://nossom.absolutezro.com',
       sso_start_url = 'https://nossom.absolutezro.com/api/zro/entrar'
 where id = 'nossom';
