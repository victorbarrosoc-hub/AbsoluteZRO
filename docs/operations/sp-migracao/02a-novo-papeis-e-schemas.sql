-- Absolute ZRO · mudança do banco para São Paulo · passo 2a: papéis e schemas
-- RODE NO PROJETO: AbsoluteZRO-SP (São Paulo, ref njvhgycmbuhimxovxuqj)  <-- o NOVO. Nunca no AbsoluteZRO antigo.
-- Gerado das migrations do repositório (origin/main). Não edite à mão.
-- Roda inteiro de uma vez: se der erro, nada fica pela metade (o bloco volta atrás sozinho).
do $guarda$ begin if exists (select 1 from pg_namespace where nspname in ('zro','maestro','sobedesce','nossom_private','carro_do_freela')) then raise exception 'PARE: este projeto já tem schemas da Absolute ZRO. Confira se está no AbsoluteZRO-SP (São Paulo) e se o passo 2a já não foi feito.'; end if; end $guarda$;
do $guarda$ begin if not exists (select 1 from pg_roles where rolname = 'authenticator') then raise exception 'PARE: isto não parece um projeto Supabase.'; end if; end $guarda$;

-- Papéis de login nascem SEM senha (ninguém entra com eles até o passo 5, em que você escolhe as senhas).
create role maestro login;
create role maestro_app nologin;
grant maestro_app to maestro with admin option;
grant maestro to postgres;

create role sobedesce_app login noinherit;
alter role sobedesce_app set search_path = sobedesce;
alter role sobedesce_app set statement_timeout = '30s';
grant sobedesce_app to postgres;

create role carro_do_freela login;
create role carro_do_freela_app nologin;
grant carro_do_freela_app to carro_do_freela;
grant carro_do_freela to postgres;

grant create on database postgres to maestro, carro_do_freela;

create schema maestro authorization maestro;
create schema sobedesce authorization sobedesce_app;
create schema carro_do_freela authorization carro_do_freela;
grant usage on schema carro_do_freela to anon;

select 'ok: passo 2a feito (papéis e schemas). Siga para o 2b.' as resultado;
