-- Absolute ZRO HUB · 0032 · "Abrir no TPeasy": o servidor do TPeasy lê o roteiro do projeto com o token da pessoa.
-- Escopo de API tpeasy.roteiros só no cliente do produto (como 0014 fez com o Carro). Organização, papel e plano
-- continuam saindo do banco (authorize): o escopo só diz que o app pode pedir, não o que a pessoa vê.

update zro.oauth_clients set scopes = scopes || array['tpeasy.roteiros']
where (id = 'tpeasy-web' or product_id = 'tpeasy') and not ('tpeasy.roteiros' = any (scopes));
