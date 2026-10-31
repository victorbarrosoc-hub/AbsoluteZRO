-- Absolute ZRO HUB · 0043 · Sons (Sonoplasta do AEON, pedido do titular em 31/10/2026).
-- O escopo `zro.sons` entra em todo cliente da família (como o `zro.ia` da 0016 e o `zro.agenda` da 0026): o app pede no
-- login único e busca efeitos sonoros livres (/api/v1/sons/*) com o token da pessoa. Nada de tabela: o HUB só repassa
-- a busca e o arquivo do Openverse (packages/core/src/sons.ts).
update zro.oauth_clients set scopes = scopes || array['zro.sons']
  where product_id is not null and not ('zro.sons' = any (scopes));
