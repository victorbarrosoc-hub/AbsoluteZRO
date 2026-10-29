-- Carro do Freela · 0000 · perfil e inventário do freela no schema `carro_do_freela` (29/10/2026).
-- Roda só no banco do Carro (Supabase AbsoluteZRO, schema `carro_do_freela`), nunca no schema `zro` nem nos dos outros
-- apps. Os arquivos desta pasta são a fonte: o mesmo conjunto se aplica num projeto Supabase novo (a mudança para São
-- Paulo) sem passo à mão além dos papéis de db/PRODUCAO.md.
--
-- ⚠️ O SCHEMA JÁ EXISTE EM PRODUÇÃO e já tem dono e dados: `cadastros`, `leads` e `passos` (lista de convite e contagem
-- anônima do app antigo, dono `postgres`, `anon` só com INSERT por política). Esta migração NÃO toca neles nem nas
-- permissões do schema que eles usam (o `usage` do `anon` fica): só acrescenta as tabelas novas, todas fechadas para
-- `anon` e `authenticated`.
--
-- Papéis (mesmo desenho do Maestro, products/maestro/drizzle/0000_fundacao.sql):
--   dono das tabelas novas = quem roda as migrações (no Supabase: o login `carro_do_freela`; local: postgres). Só o
--                      código de sistema usa essa porta (`asSystem` em db/banco.js): a migração e o publicador da fila.
--   carro_do_freela_app = papel sem login que o servidor assume (SET LOCAL ROLE) em toda operação de pessoa. Não é dono
--                      nem tem BYPASSRLS: as políticas abaixo valem sempre.
-- Contexto por transação (`asUser`): carro_do_freela.sub = o `sub` da conta Absolute ZRO, por set_config(…, true).
--
-- ⚠️ Regras do Carro que o banco também guarda: telefone nunca (nenhuma coluna de telefone, CPF ou e-mail, e os textos
-- livres recusam sequência com jeito de número de telefone); nenhuma diária inventada (a diária do item é opcional e só
-- quem é dono escreve); nenhuma linha semeada.

-- O schema é criado pelo migrador (db/migrador.js) se ainda não existir, junto com o diário `__migracoes`.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'carro_do_freela_app') then
    begin
      create role carro_do_freela_app nologin;
    exception when insufficient_privilege then
      raise exception 'Crie o papel carro_do_freela_app antes (create role carro_do_freela_app nologin; grant carro_do_freela_app to carro_do_freela), com um papel que possa criar papéis.';
    end;
  end if;
end
$$;
do $$
begin
  -- quem migra precisa poder assumir carro_do_freela_app (nos testes e no SET LOCAL ROLE do servidor)
  if not pg_has_role(current_user, 'carro_do_freela_app', 'member') then
    execute format('grant carro_do_freela_app to %I', current_user);
  end if;
  -- o login do pool em produção é `carro_do_freela`
  if exists (select 1 from pg_roles where rolname = 'carro_do_freela') and current_user <> 'carro_do_freela'
     and not pg_has_role('carro_do_freela', 'carro_do_freela_app', 'member') then
    execute 'grant carro_do_freela_app to carro_do_freela';
  end if;
end
$$;

-- só acrescenta: o servidor entra no schema. O que já valia para os outros papéis (o `anon` das tabelas antigas) fica.
grant usage on schema carro_do_freela to carro_do_freela_app;

-- ───────────── contexto e conferências ─────────────

create or replace function carro_do_freela.sub_atual() returns uuid
language sql stable set search_path = '' as $$
  select nullif(current_setting('carro_do_freela.sub', true), '')::uuid
$$;

-- Sequência com jeito de telefone brasileiro (DDD + 8 ou 9 dígitos, com ou sem +55, espaço, ponto, traço ou parênteses).
create or replace function carro_do_freela.tem_telefone(t text) returns boolean
language sql immutable set search_path = '' as $$
  select t is not null and t ~ '(\+?55[\s.-]*)?\(?[1-9][0-9]\)?[\s.-]*9?[\s.-]*[0-9]{4}[\s.-]*[0-9]{4}'
$$;

-- Lista curta de rótulos (funções, nichos): até `n` itens, cada um com 1 a `tam` letras, sem repetir.
create or replace function carro_do_freela.lista_ok(l text[], n integer, tam integer) returns boolean
language sql immutable set search_path = '' as $$
  select l is not null
     and coalesce(array_length(l, 1), 0) <= n
     and not exists (select 1 from unnest(l) x where x is null or char_length(btrim(x)) not between 1 and tam or carro_do_freela.tem_telefone(x))
     and (select count(distinct lower(x)) from unnest(l) x) = coalesce(array_length(l, 1), 0)
$$;

create or replace function carro_do_freela.tocar_atualizado_em() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  return new;
end
$$;

revoke all on function carro_do_freela.sub_atual(), carro_do_freela.tem_telefone(text), carro_do_freela.lista_ok(text[], integer, integer),
  carro_do_freela.tocar_atualizado_em() from public;
grant execute on function carro_do_freela.sub_atual(), carro_do_freela.tem_telefone(text), carro_do_freela.lista_ok(text[], integer, integer) to carro_do_freela_app;

-- ───────────── perfil ─────────────

-- Um perfil por conta Absolute ZRO (`sub`). Autodeclarado. Sem telefone, CPF ou e-mail: o contato fica pelo app.
-- `visibilidade` nasce 'privado' (caixa desmarcada não é consentimento): 'contratantes' só quando a pessoa marca.
create table if not exists carro_do_freela.perfis (
  sub uuid primary key,
  nome_exibicao text not null check (char_length(btrim(nome_exibicao)) between 1 and 80 and not carro_do_freela.tem_telefone(nome_exibicao)),
  cidade text check (cidade is null or (char_length(btrim(cidade)) between 1 and 80 and not carro_do_freela.tem_telefone(cidade))),
  uf text check (uf is null or uf in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE',
                                      'PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  funcoes text[] not null default '{}' check (carro_do_freela.lista_ok(funcoes, 12, 60)),
  nichos text[] not null default '{}' check (carro_do_freela.lista_ok(nichos, 12, 60)),
  bio text check (bio is null or (char_length(bio) <= 280 and not carro_do_freela.tem_telefone(bio))),
  portfolio_url text check (portfolio_url is null or (char_length(portfolio_url) <= 300
                            and portfolio_url ~ '^https://[^\s/?#]+\.[^\s/?#]+'
                            and portfolio_url !~* '(wa\.me|whatsapp|api\.whatsapp|tel:)')),
  visibilidade text not null default 'privado' check (visibilidade in ('privado', 'contratantes')),
  visibilidade_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create or replace function carro_do_freela.perfil_visibilidade() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.visibilidade is distinct from old.visibilidade then
    new.visibilidade_em := now();
  else
    new.visibilidade_em := old.visibilidade_em;
  end if;
  if tg_op = 'UPDATE' and new.sub <> old.sub then
    raise exception 'O dono do perfil não muda.' using errcode = '42501';
  end if;
  return new;
end
$$;
revoke all on function carro_do_freela.perfil_visibilidade() from public;
create or replace trigger perfis_tocar before update on carro_do_freela.perfis for each row execute function carro_do_freela.tocar_atualizado_em();
create or replace trigger perfis_visibilidade before insert or update on carro_do_freela.perfis for each row execute function carro_do_freela.perfil_visibilidade();

-- ───────────── inventário ─────────────

-- O equipamento do próprio freela (fonte de verdade do contrato freela.inventario/1). `id` estável: o Maestro casa
-- por ele. As categorias e os limites são os do contrato (packages/media-contracts/src/freela.ts).
create table if not exists carro_do_freela.inventario (
  id uuid primary key default gen_random_uuid(),
  sub uuid not null,
  categoria text not null default 'outro'
    check (categoria in ('camera', 'lente', 'audio', 'luz', 'drone', 'estabilizador', 'monitor', 'acessorio', 'outro')),
  marca text check (marca is null or (char_length(btrim(marca)) between 1 and 60 and not carro_do_freela.tem_telefone(marca))),
  modelo text not null check (char_length(btrim(modelo)) between 1 and 120 and not carro_do_freela.tem_telefone(modelo)),
  quantidade integer not null default 1 check (quantidade between 1 and 999),
  observacao text check (observacao is null or (char_length(observacao) <= 500 and not carro_do_freela.tem_telefone(observacao))),
  diaria_cents bigint check (diaria_cents is null or diaria_cents between 0 and 100000000000),
  ativo boolean not null default true,
  -- clock_timestamp, não now(): dois itens na mesma transação ficam na ordem em que entraram
  criado_em timestamptz not null default clock_timestamp(),
  atualizado_em timestamptz not null default now()
);
create index if not exists inventario_sub_idx on carro_do_freela.inventario (sub, criado_em);
create or replace trigger inventario_tocar before update on carro_do_freela.inventario for each row execute function carro_do_freela.tocar_atualizado_em();

-- Até 500 itens por pessoa (o máximo do contrato); o dono do item não muda.
create or replace function carro_do_freela.inventario_guarda() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.sub <> old.sub then
    raise exception 'O dono do item não muda.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('carro_do_freela:inventario:' || new.sub::text));
    if (select count(*) from carro_do_freela.inventario where sub = new.sub) >= 500 then
      raise exception 'Limite de 500 itens no inventário.' using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;
revoke all on function carro_do_freela.inventario_guarda() from public;
create or replace trigger inventario_guarda before insert or update on carro_do_freela.inventario for each row execute function carro_do_freela.inventario_guarda();

-- ───────────── fila de sincronização (outbox) ─────────────

-- Cada mudança no inventário grava aqui o inventário INTEIRO da pessoa, já no formato do evento
-- `freela.inventario.atualizado` v1: { source: "carro-do-freela", inventario: freela.inventario/1 }.
-- Uma linha por transação (a chave de idempotência usa o horário da transação): várias mudanças juntas viram um
-- retrato só. Quem publica é db/sync.js, pela porta de sistema, e SÓ com CARRO_SYNC_ATIVO ligado (padrão: desligado,
-- porque a rota do HUB ainda está desligada). Despacho ambíguo vai para 'revisao', nunca para nova tentativa sozinho.
-- carro_do_freela_app não lê nem escreve aqui: só o gatilho (security definer) e o publicador.
create table if not exists carro_do_freela.inventario_eventos (
  id bigint generated always as identity primary key,
  sub uuid not null,
  tipo text not null default 'freela.inventario.atualizado' check (tipo = 'freela.inventario.atualizado'),
  versao integer not null default 1 check (versao = 1),
  idempotency_key text not null unique check (idempotency_key ~ '^freela\.inventario:[0-9a-f-]{36}:[0-9T:.Z-]+$'),
  payload jsonb not null,
  estado text not null default 'pendente' check (estado in ('pendente', 'enviando', 'enviado', 'revisao', 'substituido')),
  tentativas integer not null default 0,
  ultimo_erro text check (ultimo_erro is null or char_length(ultimo_erro) <= 500),
  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);
create index if not exists inventario_eventos_pendentes_idx on carro_do_freela.inventario_eventos (sub, id) where estado = 'pendente';

create or replace function carro_do_freela.inventario_registrar(p_sub uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_iso text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
  v_payload jsonb;
begin
  select jsonb_build_object(
           'source', 'carro-do-freela',
           'inventario', jsonb_build_object(
             'contract', 'freela.inventario/1',
             'sub', p_sub::text,
             'itens', coalesce(jsonb_agg(jsonb_build_object(
                        'id', i.id::text,
                        'categoria', i.categoria,
                        'marca', i.marca,
                        'modelo', i.modelo,
                        'quantidade', i.quantidade,
                        'observacao', i.observacao,
                        'diaria_cents', i.diaria_cents,
                        'ativo', i.ativo,
                        'atualizado_em', to_char(i.atualizado_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                      ) order by i.criado_em, i.id) filter (where i.id is not null), '[]'::jsonb),
             'atualizado_em', v_iso))
    into v_payload
    from carro_do_freela.inventario i
   where i.sub = p_sub;
  insert into carro_do_freela.inventario_eventos (sub, idempotency_key, payload)
  values (p_sub, 'freela.inventario:' || p_sub::text || ':' || v_iso, v_payload)
  on conflict (idempotency_key) do update set payload = excluded.payload
    where carro_do_freela.inventario_eventos.estado = 'pendente';
end
$$;

create or replace function carro_do_freela.inventario_mudou() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform carro_do_freela.inventario_registrar(case when tg_op = 'DELETE' then old.sub else new.sub end);
  return null;
end
$$;
revoke all on function carro_do_freela.inventario_registrar(uuid), carro_do_freela.inventario_mudou() from public;
create or replace trigger inventario_mudou after insert or update or delete on carro_do_freela.inventario
  for each row execute function carro_do_freela.inventario_mudou();

-- ───────────── RLS: cada pessoa só lê e escreve o que é dela ─────────────

alter table carro_do_freela.perfis enable row level security;
alter table carro_do_freela.inventario enable row level security;
alter table carro_do_freela.inventario_eventos enable row level security;

drop policy if exists perfis_proprio on carro_do_freela.perfis;
create policy perfis_proprio on carro_do_freela.perfis to carro_do_freela_app
  using (sub = carro_do_freela.sub_atual()) with check (sub = carro_do_freela.sub_atual());

drop policy if exists inventario_proprio on carro_do_freela.inventario;
create policy inventario_proprio on carro_do_freela.inventario to carro_do_freela_app
  using (sub = carro_do_freela.sub_atual()) with check (sub = carro_do_freela.sub_atual());

-- a fila não tem política para carro_do_freela_app: sem grant e sem política, nada passa
grant select, insert, update, delete on carro_do_freela.perfis, carro_do_freela.inventario to carro_do_freela_app;

-- No Supabase, os papéis da Data API não enxergam nada do que é novo: tudo passa pelo servidor.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on carro_do_freela.perfis, carro_do_freela.inventario, carro_do_freela.inventario_eventos, carro_do_freela.__migracoes from %I', r);
      execute format('revoke all on function carro_do_freela.sub_atual(), carro_do_freela.tem_telefone(text), carro_do_freela.lista_ok(text[], integer, integer), carro_do_freela.tocar_atualizado_em(), carro_do_freela.perfil_visibilidade(), carro_do_freela.inventario_guarda(), carro_do_freela.inventario_registrar(uuid), carro_do_freela.inventario_mudou() from %I', r);
    end if;
  end loop;
end
$$;
revoke all on carro_do_freela.inventario_eventos from carro_do_freela_app;
