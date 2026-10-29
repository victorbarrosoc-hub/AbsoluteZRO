-- Absolute ZRO HUB · 0032 · Synquei em synquei.absolutezro.com (ADR 0025, pedido do titular em 29/10/2026).
-- Registra no código o que foi ajustado em produção: o Abrir do HUB e o "Entrar com Absolute ZRO" usam o endereço
-- novo, e o cliente synquei-web aceita a volta nele. O retorno antigo continua na lista enquanto houver app de
-- computador ou aba aberta no synquei.vercel.app (o login lá recomeça já no endereço novo).
update zro.products
   set external_url = 'https://synquei.absolutezro.com',
       sso_start_url = 'https://synquei.absolutezro.com/api/zro/entrar'
 where id = 'synquei';

update zro.oauth_clients
   set redirect_uris = array['https://synquei.absolutezro.com/api/zro/callback'] || array_remove(redirect_uris, 'https://synquei.absolutezro.com/api/zro/callback')
 where id = 'synquei-web';
