-- Rift Motion · 0002 · custo de cada geração (pedido do titular, 01/11/2026: mostrar créditos, opções de gasto e o uso).
-- `opcao` é a escolha da pessoa (rapido, equilibrado, maximo); `creditos` (conta, créditos do plano) ou `usd` (chave da
-- API) é o custo que a Higgsfield informou ANTES de gerar. Falha, recusa e cancelamento não contam no uso (a Higgsfield
-- devolve). Nada aqui é estimativa do Rift.
alter table rift.geracoes
  add column opcao text check (opcao is null or opcao in ('rapido', 'equilibrado', 'maximo')),
  add column creditos numeric(10, 2) check (creditos is null or creditos >= 0),
  add column usd numeric(10, 4) check (usd is null or usd >= 0);
