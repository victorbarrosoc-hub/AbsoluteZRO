-- Rift Motion · 0003 · prévias em imagem antes do vídeo (pedido do titular, 01/11/2026: gastar menos vendo antes o que
-- vai ser feito). A mesma tabela de gerações guarda pedidos de imagem: `saida` diz se é vídeo ou imagem, `quantidade`
-- quantas prévias e `resultados` os endereços que a Higgsfield devolveu. Imagem não tem duração.
alter table rift.geracoes
  add column saida text not null default 'video' check (saida in ('video', 'imagem')),
  add column quantidade smallint check (quantidade is null or quantidade between 1 and 4),
  add column resultados jsonb check (resultados is null or (jsonb_typeof(resultados) = 'array' and jsonb_array_length(resultados) <= 4)),
  alter column duracao drop not null;
