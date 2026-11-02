-- Absolute ZRO HUB · 0056 · custo real da Z dos clientes (ADR 0040)
--
-- O chat de produção da Z passa a gravar o custo de cada resposta em `zro.z_lab_uso` (antes só o Laboratório e o Rift
-- gravavam, e o painel /admin/custos mostrava zero). Quatro colunas novas, todas opcionais (linhas antigas ficam nulas):
-- - `org_id`: a organização de quem perguntou (set null se a organização sair).
-- - `produto`: a plataforma de origem da conversa (nulo = HUB).
-- - `nivel`: o nível que decidiu o modelo (zero, orbita, absoluto; nulo = não resolvido).
-- - `origem`: 'chat' (clientes), 'lab' ou 'rift'. O teto do dia do chat e o painel por modelo/nível leem só 'chat'; o
--   teto do Laboratório (z_lab_config) deixa o chat de fora.
--
-- RLS: a tabela segue só da administração da plataforma (0036, force row level security). O chat grava como sistema
-- (db.asSystem, depois de autenticar e conferir crédito), então quem gasta é uma pessoa comum e não precisa de política.
-- Pessoa comum não lê nem grava nada pelo papel zro_app (teste de isolamento em tests/integration/z-custo-plano.test.ts).

alter table zro.z_lab_uso
  add column if not exists org_id uuid references zro.organizations (id) on delete set null,
  add column if not exists produto text check (produto is null or char_length(produto) <= 80),
  add column if not exists nivel text check (nivel is null or nivel in ('zero', 'orbita', 'absoluto')),
  add column if not exists origem text check (origem is null or origem in ('chat', 'lab', 'rift'));

-- O teto por pessoa e o global leem o dia de hoje só do chat.
create index if not exists z_lab_uso_chat_dia on zro.z_lab_uso (dia, user_id) where origem = 'chat';
