-- Absolute ZRO HUB · 0026 · Conexões (pedido do titular, 29/10/2026; ADR 0026). Como o Apple ID com o iCloud: a pessoa
-- conecta o Google Agenda UMA vez na conta Absolute ZRO e os apps da família usam pelo HUB (API /api/v1/agenda/*).
--
-- - Uma conexão por pessoa e provedor (`zro.conexoes`). É da PESSOA, não da organização: ninguém mais a vê, nem quem
--   administra a organização (RLS por user_id).
-- - Tokens do Google só cifrados (AES-256-GCM, chave derivada por HKDF de ZRO_CONEXOES_KEY, contexto amarrado à
--   pessoa e ao campo). O banco nunca vê o texto. `estado = 'reconectar'`: o Google recusou o refresh token
--   (invalid_grant); os tokens já foram apagados e a pessoa conecta de novo.
-- - Desconectar revoga no Google e APAGA a linha (e as permissões por app, em cascata). A trilha fica em audit_logs.
-- - Permissão por app (`zro.conexao_apps`): sem linha = ligado (o padrão para os apps da própria pessoa); a pessoa
--   desliga um app na tela /conexoes. `usado_em` mostra "Usado por".
-- - O escopo `zro.agenda` entra em todo cliente da família (como o `zro.ia` da 0016): o app pede no login único e
--   chama a API com o token da pessoa.

create table if not exists zro.conexoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references zro.users (id) on delete cascade,
  provedor text not null check (provedor in ('google')),
  conta_email text not null check (char_length(conta_email) between 3 and 320),
  conta_sub text not null check (char_length(conta_sub) between 1 and 255),
  escopos text[] not null default '{}',
  refresh_token_enc text,
  access_token_enc text,
  access_expira_em timestamptz,
  -- Agendas que contam para "ocupado" e para a lista de eventos; os apps gravam na principal.
  calendarios text[] not null default array['primary'] check (cardinality(calendarios) between 1 and 20),
  estado text not null default 'ativa' check (estado in ('ativa', 'reconectar')),
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  usada_em timestamptz,
  unique (user_id, provedor),
  check (estado = 'reconectar' or refresh_token_enc is not null)
);

create table if not exists zro.conexao_apps (
  conexao_id uuid not null references zro.conexoes (id) on delete cascade,
  -- O app é o produto do cliente OAuth do token (zro.oauth_clients.product_id), o mesmo {app} da API.
  app text not null references zro.products (id) on delete cascade,
  ativo boolean not null default true,
  usado_em timestamptz,
  atualizado_em timestamptz not null default now(),
  primary key (conexao_id, app)
);

alter table zro.conexoes enable row level security;
alter table zro.conexoes force row level security;
alter table zro.conexao_apps enable row level security;
alter table zro.conexao_apps force row level security;

grant select, insert, update, delete on zro.conexoes, zro.conexao_apps to zro_app;

drop policy if exists conexoes_pessoa on zro.conexoes;
create policy conexoes_pessoa on zro.conexoes for all to zro_app
  using (user_id = zro.current_user_id())
  with check (user_id = zro.current_user_id());

drop policy if exists conexao_apps_pessoa on zro.conexao_apps;
create policy conexao_apps_pessoa on zro.conexao_apps for all to zro_app
  using (exists (select 1 from zro.conexoes c where c.id = conexao_id and c.user_id = zro.current_user_id()))
  with check (exists (select 1 from zro.conexoes c where c.id = conexao_id and c.user_id = zro.current_user_id()));

-- Cada app da família pode pedir a Agenda com o token do login único (escopo zro.ia na 0016, mesmo desenho).
update zro.oauth_clients set scopes = scopes || array['zro.agenda']
  where product_id is not null and not ('zro.agenda' = any (scopes));
