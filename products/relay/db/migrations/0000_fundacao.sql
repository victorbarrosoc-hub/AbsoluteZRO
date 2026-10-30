-- Relay · 0000 · fundação do schema `relay` (painel na conta, pedido do titular, 30/10/2026).
-- Roda só no banco do Relay (Supabase da Absolute ZRO, schema `relay`), nunca no schema `zro` nem nos dos outros apps
-- (ADR 0013). Quem roda: scripts/migrar.mjs, com o papel dono do schema. O schema nasce antes, com o administrador
-- (`create schema relay authorization relay`): o papel `relay` não cria nada fora dele.
--
-- Papéis (mesmo desenho do Maestro, products/maestro/drizzle/0000_fundacao.sql):
--   dono das tabelas = quem roda as migrações (no Supabase: o papel `relay`, com login, só no servidor do Relay).
--   relay_app        = papel sem login que o servidor assume (SET LOCAL ROLE) em toda operação de pessoa. Não é dono
--                      nem tem BYPASSRLS: as políticas abaixo valem sempre.
-- Contexto por transação (api/_banco.js `comoPessoa`): relay.user_sub (sub da Absolute ZRO) e relay.org_id (organização
-- ativa, pode faltar) via set_config local.
--
-- O que guarda: só nomes e números do que a pessoa converteu (nunca o arquivo), os projetos e os presets da pessoa.
-- Projetos e presets são da pessoa; a equipe (mesma organização) vê e usa quando quem criou permite (`equipe`), sem
-- poder mudar. As conversões são sempre só de quem converteu.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'relay_app') then
    begin
      create role relay_app nologin;
    exception when insufficient_privilege then
      raise exception 'Crie o papel relay_app antes (create role relay_app nologin), com um papel que possa criar papéis.';
    end;
  end if;
end
$$;
grant relay_app to current_user;

revoke all on schema relay from public;
grant usage on schema relay to relay_app;

-- quem é a pessoa da transação (vazio = ninguém: nenhuma linha passa)
create or replace function relay.sub() returns text
language sql stable set search_path = '' as $$
  select nullif(current_setting('relay.user_sub', true), '')
$$;
create or replace function relay.org() returns text
language sql stable set search_path = '' as $$
  select nullif(current_setting('relay.org_id', true), '')
$$;
revoke all on function relay.sub(), relay.org() from public;
grant execute on function relay.sub(), relay.org() to relay_app;

-- ───────── projetos: nome e destinos de sempre ─────────
create table relay.projetos (
  id text primary key check (id ~ '^pj-[a-z0-9-]{4,60}$'),
  user_sub text not null check (length(user_sub) between 1 and 200),
  org_id text check (org_id is null or length(org_id) between 1 and 100),
  nome text not null check (length(btrim(nome)) between 1 and 60),
  destinos text[] not null default '{}' check (cardinality(destinos) <= 12),
  equipe boolean not null default false,
  criado timestamptz not null default now(),
  atualizado timestamptz not null default now(),
  check (not equipe or org_id is not null)
);
create index projetos_user on relay.projetos (user_sub);
create index projetos_org on relay.projetos (org_id) where equipe;

-- ───────── presets da pessoa (a ficha de src/personalizado.js) ─────────
create table relay.presets (
  user_sub text not null check (length(user_sub) between 1 and 200),
  id text not null check (id ~ '^[a-z0-9-]{2,60}$'),
  org_id text check (org_id is null or length(org_id) between 1 and 100),
  ficha jsonb not null check (jsonb_typeof(ficha) = 'object' and pg_column_size(ficha) <= 16384),
  equipe boolean not null default false,
  atualizado timestamptz not null default now(),
  primary key (user_sub, id),
  check (not equipe or org_id is not null)
);
create index presets_org on relay.presets (org_id) where equipe;

-- ───────── conversões: o histórico do painel ─────────
create table relay.conversoes (
  user_sub text not null check (length(user_sub) between 1 and 200),
  id text not null check (id ~ '^cv-[a-z0-9-]{4,60}$'),
  quando timestamptz not null,
  projeto_id text references relay.projetos (id) on delete set null,
  origem text not null default 'navegador' check (origem in ('navegador', 'computador', 'sobedesce')),
  entrada jsonb not null check (jsonb_typeof(entrada) = 'object' and pg_column_size(entrada) <= 2048),
  preset jsonb not null check (jsonb_typeof(preset) = 'object' and pg_column_size(preset) <= 2048),
  saida jsonb not null check (jsonb_typeof(saida) = 'object' and pg_column_size(saida) <= 2048),
  segundos real not null default 0 check (segundos >= 0),
  criado timestamptz not null default now(),
  primary key (user_sub, id)
);
create index conversoes_recentes on relay.conversoes (user_sub, quando desc);

-- ───────── RLS ─────────
alter table relay.projetos enable row level security;
alter table relay.projetos force row level security;
alter table relay.presets enable row level security;
alter table relay.presets force row level security;
alter table relay.conversoes enable row level security;
alter table relay.conversoes force row level security;

grant select, insert, update, delete on relay.projetos, relay.presets, relay.conversoes to relay_app;

-- a pessoa vê o que é dela; e o da equipe que quem criou liberou (mesma organização ativa)
create policy projetos_ver on relay.projetos for select to relay_app
  using (user_sub = relay.sub() or (equipe and org_id = relay.org()));
create policy projetos_criar on relay.projetos for insert to relay_app
  with check (user_sub = relay.sub() and (org_id is null or org_id = relay.org()));
create policy projetos_mudar on relay.projetos for update to relay_app
  using (user_sub = relay.sub())
  with check (user_sub = relay.sub() and (org_id is null or org_id = relay.org()));
create policy projetos_apagar on relay.projetos for delete to relay_app
  using (user_sub = relay.sub());

create policy presets_ver on relay.presets for select to relay_app
  using (user_sub = relay.sub() or (equipe and org_id = relay.org()));
create policy presets_criar on relay.presets for insert to relay_app
  with check (user_sub = relay.sub() and (org_id is null or org_id = relay.org()));
create policy presets_mudar on relay.presets for update to relay_app
  using (user_sub = relay.sub())
  with check (user_sub = relay.sub() and (org_id is null or org_id = relay.org()));
create policy presets_apagar on relay.presets for delete to relay_app
  using (user_sub = relay.sub());

-- conversão: só de quem converteu; o projeto, se houver, precisa estar visível para a pessoa (dela ou da equipe)
create policy conversoes_ver on relay.conversoes for select to relay_app
  using (user_sub = relay.sub());
create policy conversoes_criar on relay.conversoes for insert to relay_app
  with check (user_sub = relay.sub() and (projeto_id is null or exists (select 1 from relay.projetos p where p.id = projeto_id)));
create policy conversoes_mudar on relay.conversoes for update to relay_app
  using (user_sub = relay.sub())
  with check (user_sub = relay.sub() and (projeto_id is null or exists (select 1 from relay.projetos p where p.id = projeto_id)));
create policy conversoes_apagar on relay.conversoes for delete to relay_app
  using (user_sub = relay.sub());

-- No Supabase, os papéis da Data API (anon, authenticated) não enxergam nada do Relay: tudo passa pelo servidor.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema relay from anon, authenticated';
    execute 'revoke all on schema relay from anon, authenticated';
  end if;
end
$$;
