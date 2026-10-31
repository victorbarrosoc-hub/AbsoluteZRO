-- Absolute ZRO HUB · 0044 · TPeasy em tpeasy.absolutezro.com (pedido do titular, 31/10/2026). O domínio já está ligado e
-- verificado no projeto Vercel `tpeasy`. Numa mesma transação, como a 0034 fez com o NOSSOM:
-- - o cliente OIDC `tpeasy-web` passa a aceitar o retorno do subdomínio. O antigo continua: o tpeasy.vercel.app segue
--   valendo como endereço próprio, sem redirecionar (os roteiros ficam no aparelho, presos ao endereço em que foram
--   escritos, e o app instalado na Tela de Início abre sempre o endereço em que foi instalado);
-- - o catálogo do HUB (Abrir, links) passa a abrir o subdomínio, já pelo início do login único.
-- O TPeasy aceita os dois endereços (products/tpeasy/api/zro/_zro.mjs). Se esta migração chegar antes do TPeasy novo,
-- nada quebra: o TPeasy antigo manda quem chega pelo subdomínio para o tpeasy.vercel.app, que já tem retorno cadastrado.
-- Idempotente: só acrescenta o que falta, e só no cliente que existe (ele é cadastrado pelo console, não por migração).

update zro.oauth_clients
   set redirect_uris = array_append(redirect_uris, 'https://tpeasy.absolutezro.com/api/zro/callback')
 where id = 'tpeasy-web'
   and not ('https://tpeasy.absolutezro.com/api/zro/callback' = any (redirect_uris));

update zro.products
   set external_url = 'https://tpeasy.absolutezro.com',
       sso_start_url = 'https://tpeasy.absolutezro.com/api/zro/entrar'
 where id = 'tpeasy'
   and (external_url, sso_start_url) is distinct from
       ('https://tpeasy.absolutezro.com', 'https://tpeasy.absolutezro.com/api/zro/entrar');
