-- Absolute ZRO HUB · 0051 · Higgsfield nas Conexões (pedido do titular, 01/11/2026). Como o Google Agenda na 0026: a
-- pessoa conecta a conta da Higgsfield UMA vez na conta Absolute ZRO (/conexoes) e os apps da família (AEON, Rift
-- Motion) geram imagem e vídeo com os créditos do plano dela, pelo HUB (API /api/v1/higgsfield/*, escopo
-- `zro.higgsfield`). Contrato: packages/core/src/higgsfield.ts.
--
-- - A conexão é uma linha de `zro.conexoes` com provedor 'higgsfield' (a mesma RLS por pessoa, a mesma permissão por
--   app em `zro.conexao_apps`, o mesmo "Usado por"). Tokens só cifrados (AES-256-GCM, ZRO_CONEXOES_KEY, contexto
--   amarrado à pessoa e ao campo). `cliente` guarda o client_id que a Higgsfield deu ao HUB (renovar precisa dele).
-- - `zro.apps_oauth_externos`: o registro do HUB como app num serviço de fora (registro dinâmico, RFC 7591), um por
--   endereço de volta. Só o sistema lê e grava (nenhuma política para zro_app).
-- - `zro.ia_geracoes`: cada pedido de geração que um app fez em nome da pessoa (imagem ou vídeo), com o custo que a
--   Higgsfield informou ANTES de gerar. É o "quanto já foi usado" por app e no mês. Da pessoa (RLS por user_id).

alter table zro.conexoes drop constraint if exists conexoes_provedor_check;
alter table zro.conexoes add constraint conexoes_provedor_check check (provedor in ('google', 'higgsfield'));
alter table zro.conexoes add column if not exists cliente text check (cliente is null or char_length(cliente) between 1 and 200);

create table if not exists zro.apps_oauth_externos (
  servico text not null check (servico in ('higgsfield')),
  redirect text not null check (char_length(redirect) between 8 and 500),
  client_id text not null check (char_length(client_id) between 1 and 200),
  criado_em timestamptz not null default now(),
  primary key (servico, redirect)
);
alter table zro.apps_oauth_externos enable row level security;
alter table zro.apps_oauth_externos force row level security;
revoke all on zro.apps_oauth_externos from zro_app;

create table if not exists zro.ia_geracoes (
  id text primary key check (id ~ '^[a-z0-9]{12}$'),
  user_id uuid not null references zro.users (id) on delete cascade,
  app text not null references zro.products (id) on delete cascade,
  servico text not null default 'higgsfield' check (servico in ('higgsfield')),
  saida text not null check (saida in ('imagem', 'video')),
  modelo text not null check (char_length(modelo) between 1 and 80),
  opcao text check (opcao is null or opcao in ('rapido', 'equilibrado', 'maximo')),
  prompt text not null check (char_length(prompt) between 1 and 2000),
  quantidade int check (quantidade is null or quantidade between 1 and 4),
  duracao int check (duracao is null or duracao between 1 and 30),
  pedido text not null check (char_length(pedido) between 1 and 400),
  estado text not null check (estado in ('na_fila', 'gerando', 'pronto', 'falhou', 'recusado', 'cancelado')),
  creditos numeric(12, 2) check (creditos is null or creditos >= 0),
  resultados jsonb not null default '[]'::jsonb check (jsonb_typeof(resultados) = 'array' and jsonb_array_length(resultados) <= 4),
  erro text check (erro is null or char_length(erro) <= 300),
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);
create index if not exists ia_geracoes_pessoa_data on zro.ia_geracoes (user_id, criada_em desc);

alter table zro.ia_geracoes enable row level security;
alter table zro.ia_geracoes force row level security;
grant select, insert, update on zro.ia_geracoes to zro_app;

drop policy if exists ia_geracoes_pessoa on zro.ia_geracoes;
create policy ia_geracoes_pessoa on zro.ia_geracoes for all to zro_app
  using (user_id = zro.current_user_id())
  with check (user_id = zro.current_user_id());

-- O escopo entra em todo cliente da família (como zro.ia na 0016, zro.agenda na 0026 e zro.sons na 0044).
update zro.oauth_clients set scopes = scopes || array['zro.higgsfield']
  where product_id is not null and not ('zro.higgsfield' = any (scopes));
