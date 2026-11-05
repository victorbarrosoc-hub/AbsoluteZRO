-- Rádio do set · 0000 · fundação do schema `radio` (ADR 0042, pedido do titular, 05/11/2026).
-- Roda só no schema `radio` do Supabase da Absolute ZRO, nunca no `zro` nem nos dos outros apps (ADR 0013). Quem roda:
-- scripts/migrar.mjs com o papel dono do schema. O schema nasce antes, com o administrador
-- (`create schema radio authorization radio`): o papel `radio` não cria nada fora dele.
--
-- Papéis (o desenho do Relay e do Rift):
--   dono das tabelas = quem roda as migrações (no Supabase: o papel `radio`, com login, só no servidor do rádio).
--   radio_app        = papel sem login que o servidor assume (SET LOCAL ROLE) em toda operação de pessoa. Não é dono
--                      nem tem BYPASSRLS: as políticas abaixo valem sempre.
-- Contexto por transação (api/_banco.js `comoPessoa`): radio.user_sub (sub da Absolute ZRO).
--
-- O que guarda: as diárias (nome, código de entrada), quem entrou em cada uma e com qual função, a presença de cada
-- aparelho, os sinais de conexão (WebRTC: oferta e resposta, apagados ao ler) e os avisos de set. **Nenhuma voz**: o
-- áudio vai de aparelho para aparelho e não passa nem fica no servidor.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'radio_app') then
    begin
      create role radio_app nologin;
    exception when insufficient_privilege then
      raise exception 'Crie o papel radio_app antes (create role radio_app nologin), com um papel que possa criar papéis.';
    end;
  end if;
end
$$;
grant radio_app to current_user;

revoke all on schema radio from public;
grant usage on schema radio to radio_app;

create or replace function radio.sub() returns text
language sql stable set search_path = '' as $$
  select nullif(current_setting('radio.user_sub', true), '')
$$;
revoke all on function radio.sub() from public;
grant execute on function radio.sub() to radio_app;

-- ───────── diárias ─────────
create table radio.diarias (
  id text primary key check (id ~ '^[a-z0-9]{12}$'),
  codigo text not null unique check (codigo ~ '^[A-HJ-NP-Z2-9]{6}$'),
  nome text not null check (length(btrim(nome)) between 1 and 60),
  dono_sub text not null check (length(dono_sub) between 1 and 200),
  criado timestamptz not null default now(),
  expira timestamptz not null default now() + interval '3 days'
);
create index diarias_dono on radio.diarias (dono_sub, criado desc);

create table radio.membros (
  diaria_id text not null references radio.diarias (id) on delete cascade,
  user_sub text not null check (length(user_sub) between 1 and 200),
  nome text not null check (length(btrim(nome)) between 1 and 60),
  papel text not null check (papel in ('dono', 'equipe')),
  funcao text check (funcao is null or funcao in ('direcao', 'producao', 'camera', 'som', 'luz', 'arte', 'elenco')),
  entrou timestamptz not null default now(),
  primary key (diaria_id, user_sub)
);
create index membros_pessoa on radio.membros (user_sub, entrou desc);

-- ───────── presença (um por aparelho) e sinais de conexão ─────────
create table radio.presencas (
  diaria_id text not null references radio.diarias (id) on delete cascade,
  peer text not null check (peer ~ '^[a-z0-9]{16,32}$'),
  user_sub text not null check (length(user_sub) between 1 and 200),
  visto timestamptz not null default now(),
  primary key (diaria_id, peer)
);

create table radio.sinais (
  id bigint generated always as identity primary key,
  diaria_id text not null references radio.diarias (id) on delete cascade,
  de_peer text not null,
  de_sub text not null,
  para_peer text not null,
  para_sub text not null,
  tipo text not null check (tipo in ('oferta', 'resposta')),
  dados jsonb not null check (jsonb_typeof(dados) = 'object' and pg_column_size(dados) <= 16384),
  criado timestamptz not null default now()
);
create index sinais_para on radio.sinais (para_sub, diaria_id, id);

-- ───────── avisos de set ─────────
create table radio.avisos (
  id bigint generated always as identity primary key,
  diaria_id text not null references radio.diarias (id) on delete cascade,
  tipo text not null check (tipo in ('silencio', 'acao', 'corta', 'intervalo')),
  de_sub text not null,
  de_nome text not null check (length(btrim(de_nome)) between 1 and 60),
  criado timestamptz not null default now()
);
create index avisos_diaria on radio.avisos (diaria_id, id desc);

-- ───────── regras (security definer: leem membros sem depender do RLS de quem chama) ─────────

-- A pessoa está na diária (e a diária não venceu)?
create or replace function radio.membro(p_diaria text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from radio.membros m join radio.diarias d on d.id = m.diaria_id
    where m.diaria_id = p_diaria and m.user_sub = radio.sub() and d.expira > now())
$$;

-- Quem pode mandar aviso de set: quem criou a diária ou quem está na Direção.
create or replace function radio.pode_avisar(p_diaria text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from radio.membros m join radio.diarias d on d.id = m.diaria_id
    where m.diaria_id = p_diaria and m.user_sub = radio.sub() and d.expira > now()
      and (m.papel = 'dono' or m.funcao = 'direcao'))
$$;

-- Entrar numa diária pelo código (QR ou link da ordem do dia). Devolve o id, ou null se o código não vale.
create or replace function radio.entrar(p_codigo text, p_nome text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id text;
begin
  if radio.sub() is null then return null; end if;
  select d.id into v_id from radio.diarias d where d.codigo = upper(btrim(p_codigo)) and d.expira > now();
  if v_id is null then return null; end if;
  insert into radio.membros (diaria_id, user_sub, nome, papel)
  values (v_id, radio.sub(), left(btrim(p_nome), 60), 'equipe')
  on conflict (diaria_id, user_sub) do update set nome = excluded.nome;
  return v_id;
end
$$;

revoke all on function radio.membro(text), radio.pode_avisar(text), radio.entrar(text, text) from public;
grant execute on function radio.membro(text), radio.pode_avisar(text), radio.entrar(text, text) to radio_app;

-- ───────── RLS ─────────
-- diarias e membros sem FORCE: as funções de regra (security definer, donas = papel `radio`) leem as duas sem cair no
-- próprio RLS (senão a política de membros chamaria radio.membro, que lê membros, sem fim). Nenhuma rota usa o papel
-- dono: toda operação de pessoa roda como radio_app, que não é dono e passa pelo RLS.
alter table radio.diarias enable row level security;
alter table radio.membros enable row level security;
alter table radio.presencas enable row level security;
alter table radio.presencas force row level security;
alter table radio.sinais enable row level security;
alter table radio.sinais force row level security;
alter table radio.avisos enable row level security;
alter table radio.avisos force row level security;

grant select, insert, delete on radio.diarias to radio_app;
grant update (nome) on radio.diarias to radio_app;
grant select, insert, delete on radio.membros to radio_app;
-- a pessoa muda só o próprio nome e a função: o papel (dono, equipe) não se troca por update
grant update (nome, funcao) on radio.membros to radio_app;
grant select, insert, update, delete on radio.presencas to radio_app;
grant select, insert, delete on radio.sinais to radio_app;
grant select, insert on radio.avisos to radio_app;

create policy diarias_ver on radio.diarias for select to radio_app
  using (dono_sub = radio.sub() or radio.membro(id));
create policy diarias_criar on radio.diarias for insert to radio_app
  with check (dono_sub = radio.sub());
create policy diarias_dono_muda on radio.diarias for update to radio_app
  using (dono_sub = radio.sub()) with check (dono_sub = radio.sub());
create policy diarias_dono_apaga on radio.diarias for delete to radio_app
  using (dono_sub = radio.sub());

create policy membros_ver on radio.membros for select to radio_app
  using (radio.membro(diaria_id));
-- direto, só o dono se põe na própria diária; a equipe entra pelo código (radio.entrar)
create policy membros_dono_entra on radio.membros for insert to radio_app
  with check (user_sub = radio.sub() and papel = 'dono'
    and exists (select 1 from radio.diarias d where d.id = diaria_id and d.dono_sub = radio.sub()));
create policy membros_mudar_o_seu on radio.membros for update to radio_app
  using (user_sub = radio.sub()) with check (user_sub = radio.sub());
create policy membros_sair on radio.membros for delete to radio_app
  using (user_sub = radio.sub()
    or exists (select 1 from radio.diarias d where d.id = diaria_id and d.dono_sub = radio.sub()));

create policy presencas_ver on radio.presencas for select to radio_app
  using (radio.membro(diaria_id));
create policy presencas_a_sua on radio.presencas for insert to radio_app
  with check (user_sub = radio.sub() and radio.membro(diaria_id));
create policy presencas_atualizar on radio.presencas for update to radio_app
  using (user_sub = radio.sub()) with check (user_sub = radio.sub() and radio.membro(diaria_id));
create policy presencas_sair on radio.presencas for delete to radio_app
  using (user_sub = radio.sub());

-- sinal: de um aparelho meu para um aparelho que está na mesma diária; só quem recebe lê (e apaga ao ler)
create policy sinais_ler on radio.sinais for select to radio_app
  using (para_sub = radio.sub());
create policy sinais_mandar on radio.sinais for insert to radio_app
  with check (de_sub = radio.sub() and radio.membro(diaria_id)
    and exists (select 1 from radio.presencas p where p.diaria_id = sinais.diaria_id and p.peer = de_peer and p.user_sub = radio.sub())
    and exists (select 1 from radio.presencas p where p.diaria_id = sinais.diaria_id and p.peer = para_peer and p.user_sub = para_sub));
create policy sinais_apagar on radio.sinais for delete to radio_app
  using (para_sub = radio.sub() or de_sub = radio.sub());

create policy avisos_ver on radio.avisos for select to radio_app
  using (radio.membro(diaria_id));
create policy avisos_mandar on radio.avisos for insert to radio_app
  with check (de_sub = radio.sub() and radio.pode_avisar(diaria_id));
