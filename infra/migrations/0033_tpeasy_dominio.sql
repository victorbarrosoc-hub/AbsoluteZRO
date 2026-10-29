-- Absolute ZRO HUB · 0033 · TPeasy em tpeasy.absolutezro.com (ADR 0025, pedido do titular em 29/10/2026).
-- O domínio já está no projeto Vercel `tpeasy`. O retorno novo entra no cliente OIDC sem tirar o antigo: o
-- tpeasy.vercel.app continua valendo (os roteiros ficam no aparelho, por endereço; quem instalou lá não pode perder
-- nada) até existir o caminho para levar os roteiros e o redirecionamento 308. O "Abrir" do HUB passa a usar o novo.

update zro.oauth_clients
   set redirect_uris = redirect_uris || array['https://tpeasy.absolutezro.com/api/zro/callback']
 where id = 'tpeasy-web' and not ('https://tpeasy.absolutezro.com/api/zro/callback' = any (redirect_uris));

update zro.products
   set external_url = 'https://tpeasy.absolutezro.com',
       sso_start_url = 'https://tpeasy.absolutezro.com/api/zro/entrar'
 where id = 'tpeasy';
