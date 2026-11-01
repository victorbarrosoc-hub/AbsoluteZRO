-- Absolute ZRO HUB · 0051 · Synquei em synquei.absolutezro.com (revisão dos sites de 01/11/2026). O domínio já responde
-- no projeto Vercel `synquei`, mas o login ainda voltava por synquei.vercel.app. Numa mesma transação, como a 0045 fez
-- com o TPeasy:
-- - o cliente OIDC `synquei-web` passa a aceitar o retorno do subdomínio. O antigo continua: o app do celular instalado
--   em synquei.vercel.app/app/ guarda os projetos no próprio endereço (localStorage) e segue entrando por lá;
-- - o catálogo do HUB (Abrir, links) passa a abrir o subdomínio, já pelo início do login único.
-- O app de computador não muda: ele entra pelo cliente `synquei-desktop`, com retorno no próprio computador.
-- O Synquei novo (products/synquei/api/_zro.js) devolve cada endereço para o próprio retorno. Se esta migração chegar
-- antes dele, nada quebra: o Synquei antigo manda quem chega pelo subdomínio para o synquei.vercel.app.
-- Idempotente: só acrescenta o que falta, e só no cliente que existe (ele é cadastrado pelo console, não por migração).

update zro.oauth_clients
   set redirect_uris = array_append(redirect_uris, 'https://synquei.absolutezro.com/api/zro/callback')
 where id = 'synquei-web'
   and not ('https://synquei.absolutezro.com/api/zro/callback' = any (redirect_uris));

update zro.products
   set external_url = 'https://synquei.absolutezro.com',
       sso_start_url = 'https://synquei.absolutezro.com/api/zro/entrar'
 where id = 'synquei'
   and (external_url, sso_start_url) is distinct from
       ('https://synquei.absolutezro.com', 'https://synquei.absolutezro.com/api/zro/entrar');
