-- Rift Motion · 0000 · fundação do schema `rift` (banco próprio, pedido do titular, 01/11/2026).
-- Roda só no schema `rift` do Supabase da Absolute ZRO, nunca no `zro` nem nos dos outros apps (ADR 0013). Quem roda:
-- scripts/migrar.mjs com o papel dono do schema. O schema nasce antes, com o administrador
-- (`create schema rift authorization rift`): o papel `rift` não cria nada fora dele.
--
-- Papéis (o desenho do Relay, products/relay/db/migrations/0000_fundacao.sql):
--   dono das tabelas = quem roda as migrações (no Supabase: o papel `rift`, com login, só no servidor do Rift).
--   rift_app         = papel sem login que o servidor assume (SET LOCAL ROLE) em toda operação de pessoa. Não é dono
--                      nem tem BYPASSRLS: as políticas abaixo valem sempre.
-- Contexto por transação (api/_banco.js `comoPessoa`): rift.user_sub (sub da Absolute ZRO) e rift.org_id.
--
-- O que guarda: os projetos (nome, formato, cadência, duração e, quando houver, a cena), a biblioteca (só nome, tipo e
-- tamanho: o arquivo fica no computador da pessoa) e as exportações pedidas. Tudo é só de quem criou.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'rift_app') then
    begin
      create role rift_app nologin;
    exception when insufficient_privilege then
      raise exception 'Crie o papel rift_app antes (create role rift_app nologin), com um papel que possa criar papéis.';
    end;
  end if;
end
$$;
grant rift_app to current_user;

revoke all on schema rift from public;
grant usage on schema rift to rift_app;

create or replace function rift.sub() returns text
language sql stable set search_path = '' as $$
  select nullif(current_setting('rift.user_sub', true), '')
$$;
create or replace function rift.org() returns text
language sql stable set search_path = '' as $$
  select nullif(current_setting('rift.org_id', true), '')
$$;
revoke all on function rift.sub(), rift.org() from public;
grant execute on function rift.sub(), rift.org() to rift_app;

-- ───────── projetos ─────────
create table rift.projetos (
  user_sub text not null check (length(user_sub) between 1 and 200),
  id text not null check (id ~ '^[a-z0-9]{6,24}$'),
  org_id text check (org_id is null or length(org_id) between 1 and 100),
  nome text not null check (length(btrim(nome)) between 1 and 80),
  formato text not null check (formato in ('16:9', '9:16', '1:1', '4:5', '4K')),
  largura integer not null check (largura between 16 and 8192),
  altura integer not null check (altura between 16 and 8192),
  cadencia text not null check (cadencia in ('12', '15', '23.976', '24', '29.97', '30', '60', '120')),
  duracao numeric(7, 3) not null check (duracao > 0 and duracao <= 3600),
  modelo text check (modelo is null or modelo ~ '^[a-z0-9-]{2,40}$'),
  tom smallint not null default 20 check (tom between 0 and 359),
  exemplo boolean not null default false,
  -- a cena do estúdio (camadas, trilhas, keyframes) quando o estúdio passar a salvar; por ora vazia
  cena jsonb check (cena is null or (jsonb_typeof(cena) = 'object' and pg_column_size(cena) <= 262144)),
  criado timestamptz not null default now(),
  editado timestamptz not null default now(),
  primary key (user_sub, id)
);
create index projetos_recentes on rift.projetos (user_sub, editado desc);

-- ───────── biblioteca: só o que identifica o arquivo ─────────
create table rift.biblioteca (
  user_sub text not null check (length(user_sub) between 1 and 200),
  id text not null check (id ~ '^[a-z0-9]{6,24}$'),
  nome text not null check (length(btrim(nome)) between 1 and 255),
  tipo text not null check (tipo in ('Vídeo', 'Imagem', 'Áudio', 'Modelo 3D', 'Lottie', 'Arquivo')),
  ext text not null default '' check (length(ext) <= 8),
  tamanho bigint not null check (tamanho >= 0),
  criado timestamptz not null default now(),
  primary key (user_sub, id)
);
create index biblioteca_recentes on rift.biblioteca (user_sub, criado desc);

-- ───────── exportações pedidas ao Relay ─────────
create table rift.exportacoes (
  user_sub text not null check (length(user_sub) between 1 and 200),
  id text not null check (id ~ '^[a-z0-9]{6,24}$'),
  projeto_id text,
  projeto_nome text not null check (length(btrim(projeto_nome)) between 1 and 80),
  formato text not null check (length(formato) between 1 and 40),
  cadencia text not null check (cadencia in ('12', '15', '23,976', '24', '29,97', '30', '60', '120')),
  tamanho text not null check (length(tamanho) between 1 and 20),
  destino text not null check (length(destino) between 1 and 40),
  -- o Relay ainda não renderiza a partir do Rift: tudo nasce "nao_renderizado" (nunca fingir progresso)
  estado text not null default 'nao_renderizado' check (estado in ('nao_renderizado', 'na_fila', 'renderizando', 'pronto', 'falhou')),
  criado timestamptz not null default now(),
  primary key (user_sub, id),
  foreign key (user_sub, projeto_id) references rift.projetos (user_sub, id) on delete set null (projeto_id)
);
create index exportacoes_recentes on rift.exportacoes (user_sub, criado desc);

-- ───────── RLS: tudo é só de quem criou ─────────
alter table rift.projetos enable row level security;
alter table rift.projetos force row level security;
alter table rift.biblioteca enable row level security;
alter table rift.biblioteca force row level security;
alter table rift.exportacoes enable row level security;
alter table rift.exportacoes force row level security;

grant select, insert, update, delete on rift.projetos, rift.biblioteca, rift.exportacoes to rift_app;

create policy projetos_dono on rift.projetos for all to rift_app
  using (user_sub = rift.sub())
  with check (user_sub = rift.sub() and (org_id is null or org_id = rift.org()));
create policy biblioteca_dono on rift.biblioteca for all to rift_app
  using (user_sub = rift.sub())
  with check (user_sub = rift.sub());
create policy exportacoes_dono on rift.exportacoes for all to rift_app
  using (user_sub = rift.sub())
  with check (user_sub = rift.sub());
