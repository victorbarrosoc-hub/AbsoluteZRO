-- Absolute ZRO HUB · 0059 · o rádio do set roda dentro do HUB, em absolutezro.com/radio (ADR 0042; titular, 05/11/2026:
-- "usa o do ecossistema"). Os dados continuam no schema `radio` (um schema e um papel por app, nunca dentro de `zro`),
-- criado pelas migrações de products/radio/db/migrations com o papel dono `radio`.
--
-- O HUB só ASSUME o papel `radio_app` (sem login, não é dono, sem BYPASSRLS) em cada operação de pessoa
-- (apps/hub-web/lib/radio, `noRadio`): o RLS do schema vale sempre. Aqui o papel do HUB passa a poder assumi-lo.
-- Sem o schema do rádio (banco sem o app), não faz nada. Idempotente.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'radio_app') then
    execute format('grant radio_app to %I', current_user);
  end if;
end
$$;
