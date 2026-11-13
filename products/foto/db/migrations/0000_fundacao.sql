-- Plataforma de fotos · 0000 · fundação do schema `foto` (ADR 0044).
-- Roda só no banco do app (Supabase da Absolute ZRO, schema `foto`), nunca no schema `zro` nem nos dos outros apps
-- (ADR 0013). Quem roda: scripts/migrar.mjs, com o papel dono do schema. O schema nasce antes, com o administrador
-- (`create schema foto authorization foto`): o papel `foto` não cria nada fora dele.
--
-- Papéis (mesmo desenho do Relay, products/relay/db/migrations/0000_fundacao.sql):
--   dono das tabelas = quem roda as migrações (no Supabase: o papel `foto`, com login, só no servidor do app).
--   foto_app         = papel sem login que o servidor assume (SET LOCAL ROLE) em toda operação de pessoa. Não é dono
--                      nem tem BYPASSRLS: as políticas valem sempre.
-- Contexto por transação (api/_banco.js `comoPessoa`): foto.user_sub (sub da Absolute ZRO) e foto.org_id (organização
-- ativa, pode faltar) via set_config local.
--
-- Aqui só o chão: papel, permissões do schema e quem é a pessoa da transação. As tabelas chegam a partir da 0001,
-- todas com RLS e teste de isolamento. O que este banco pode guardar: marcas, predefinições e galerias do cliente;
-- nunca a foto original (ela não sai do aparelho).

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'foto_app') then
    begin
      create role foto_app nologin;
    exception when insufficient_privilege then
      raise exception 'Crie o papel foto_app antes (create role foto_app nologin), com um papel que possa criar papéis.';
    end;
  end if;
end
$$;
grant foto_app to current_user;

revoke all on schema foto from public;
grant usage on schema foto to foto_app;

-- quem é a pessoa da transação (vazio = ninguém: nenhuma linha passa)
create or replace function foto.sub() returns text
language sql stable set search_path = '' as $$
  select nullif(current_setting('foto.user_sub', true), '')
$$;
create or replace function foto.org() returns text
language sql stable set search_path = '' as $$
  select nullif(current_setting('foto.org_id', true), '')
$$;
revoke all on function foto.sub(), foto.org() from public;
grant execute on function foto.sub(), foto.org() to foto_app;
