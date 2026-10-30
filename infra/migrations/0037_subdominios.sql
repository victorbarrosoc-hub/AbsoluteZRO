-- Absolute ZRO HUB · 0037 · Carro do Freela e SOBEDESCE no subdomínio da Absolute ZRO (decisão do titular, 30/10/2026).
-- "carro.absolutezro.com e sobedesce.absolutezro.com". Este passo só CADASTRA o retorno do login único nos endereços
-- novos, ao lado dos antigos (carrodofreela.com.br, sobedesce.com e os .vercel.app continuam valendo): o login passa a
-- funcionar no subdomínio assim que o DNS e a Vercel apontarem para ele, e nada quebra antes disso. Trocar o endereço
-- principal (Abrir do HUB, links da família) é o passo seguinte, depois de o subdomínio estar no ar.
-- Idempotente: só acrescenta o que falta, e só nos clientes que existem.

update zro.oauth_clients
   set redirect_uris = redirect_uris || array['https://carro.absolutezro.com/api/zro/callback']
 where id = 'carrodofreela-web'
   and not ('https://carro.absolutezro.com/api/zro/callback' = any (redirect_uris));

update zro.oauth_clients
   set redirect_uris = redirect_uris || array['https://sobedesce.absolutezro.com/api/zro/callback']
 where id = 'sobedesce-web'
   and not ('https://sobedesce.absolutezro.com/api/zro/callback' = any (redirect_uris));
