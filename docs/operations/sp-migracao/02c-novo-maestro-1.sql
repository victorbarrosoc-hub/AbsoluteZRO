-- Absolute ZRO · mudança do banco para São Paulo · passo 2c: Maestro (parte 1 de 2): 0000_fundacao a 0007_freelas_agenda
-- RODE NO PROJETO: AbsoluteZRO-SP (São Paulo, ref njvhgycmbuhimxovxuqj)  <-- o NOVO. Nunca no AbsoluteZRO antigo.
-- Gerado das migrations do repositório (origin/main). Não edite à mão.
-- Roda inteiro de uma vez: se der erro, nada fica pela metade (o bloco volta atrás sozinho).
do $guarda$ begin if not exists (select 1 from pg_namespace where nspname = 'maestro') then raise exception 'PARE: rode antes o passo 2a (ou você está no projeto errado).'; end if; end $guarda$;
do $guarda$ begin if to_regclass('"maestro"."__drizzle_migrations"') is not null then raise exception 'PARE: o maestro já tem migrações aqui. Esta parte já foi feita, ou este é o projeto antigo.'; end if; end $guarda$;
set local role maestro;
create table if not exists "maestro"."__drizzle_migrations" (id serial primary key, hash text not null, created_at bigint);

-- ===== 0000_fundacao =====
set local search_path to "maestro", pg_catalog;
-- Maestro · 0000 · fundação do schema `maestro` (Etapa 0, 28/10/2026).
-- Roda só no banco do Maestro (Supabase AbsoluteZRO, schema `maestro`), nunca no schema `zro` nem nos dos outros apps.
--
-- Papéis (mesmo desenho de infra/migrations/0001_foundation.sql e 0002_rls.sql do HUB):
--   dono das tabelas = quem roda as migrações (no Supabase: o papel `maestro`, dono do schema; local: postgres).
--                      Usado só pelo código de sistema (sessões, callback do login, link do cliente), pela porta
--                      `asSystem` de src/lib/db/client.ts.
--   maestro_app      = papel sem login que o servidor assume (SET LOCAL ROLE) em toda operação de usuário. Não é dono
--                      nem tem BYPASSRLS: as políticas abaixo valem sempre.
-- Contexto por transação (`asUser`): maestro.user_sub (claim sub da Absolute ZRO) e maestro.org_id via set_config.
-- Cards: a escrita é só por função (card_criar, card_mudar, card_apagar, card_restaurar): maestro_app não tem
-- insert/update/delete na tabela. Histórico, decisões do cliente e auditoria só crescem.

create schema if not exists maestro;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'maestro_app') then
    begin
      create role maestro_app nologin;
    exception when insufficient_privilege then
      raise exception 'Crie o papel maestro_app antes (create role maestro_app nologin), com um papel que possa criar papéis.';
    end;
  end if;
end
$$;
grant maestro_app to current_user;
do $$
begin
  -- O login do pool em produção é o dono do schema (`maestro`); ele precisa poder assumir maestro_app.
  if exists (select 1 from pg_roles where rolname = 'maestro') and current_user <> 'maestro' then
    execute 'grant maestro_app to maestro';
  end if;
end
$$;

revoke all on schema maestro from public;
grant usage on schema maestro to maestro_app;

-- No Supabase, os papéis da Data API não enxergam nada do Maestro: tudo passa pelo servidor.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on schema maestro from %I', r);
    end if;
  end loop;
end
$$;

-- ───────────── contexto ─────────────

create or replace function maestro.current_sub() returns uuid
language sql stable set search_path = '' as $$
  select nullif(current_setting('maestro.user_sub', true), '')::uuid
$$;

create or replace function maestro.current_org_id() returns uuid
language sql stable set search_path = '' as $$
  select nullif(current_setting('maestro.org_id', true), '')::uuid
$$;

create or replace function maestro.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- ───────────── organização, pessoas e sessões ─────────────

-- A organização do Maestro é a organização da Absolute ZRO (claim zro_org.id), 1:1.
create table if not exists maestro.organizations (
  id uuid primary key default gen_random_uuid(),
  zro_org_id uuid not null unique,
  name text not null check (length(name) between 1 and 200),
  zro_products text[] not null default '{}',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create or replace trigger organizations_touch before update on maestro.organizations for each row execute function maestro.touch_updated_at();

-- Quem entra vira membro. O papel vem da organização da Absolute ZRO por tabela fixa (lib/papeis.ts), reaplicado a
-- cada login; revisor e funcao são do Maestro (ajustados por admin).
create table if not exists maestro.members (
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  zro_sub uuid not null,
  display_name text,
  email text,
  picture_url text,
  hub_role text,
  role text not null default 'leitura' check (role in ('admin', 'gestor', 'equipe', 'leitura')),
  revisor boolean not null default false,
  funcao text check (funcao is null or length(funcao) <= 80),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  last_login_at timestamptz,
  primary key (org_id, zro_sub)
);

-- Sessão própria (cookie mae_sessao): só o sha256 do token; tokens da Absolute ZRO cifrados (MAESTRO_KEY).
create table if not exists maestro.sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  zro_sub uuid not null,
  token_hash text not null unique,
  produtos text[] not null default '{}',
  zro_tokens_enc text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  perfil_lido_em timestamptz
);
create index if not exists sessions_org_sub_idx on maestro.sessions (org_id, zro_sub) where revoked_at is null;

-- ───────────── clientes e projetos ─────────────

create table if not exists maestro.clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  segment text,
  city text,
  document text,
  contact_name text,
  email text,
  phone text,
  instagram text,
  notes text,
  approver jsonb not null default '{}'::jsonb,
  recurring jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists clients_org_idx on maestro.clients (org_id);
create or replace trigger clients_touch before update on maestro.clients for each row execute function maestro.touch_updated_at();

-- Projeto do Maestro. zro_project_id = projeto canônico no HUB; o vínculo é automático ao criar (idempotente):
-- link_status pending → linked, ou failed (tenta de novo); unlinked quando a pessoa desliga. O Maestro funciona sozinho.
create table if not exists maestro.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  client_id uuid references maestro.clients (id) on delete set null,
  code text not null check (code ~ '^[A-Z]{2,6}-[0-9]{4}-[0-9]{3,5}$'),
  title text not null check (length(title) between 1 and 200),
  category text,
  stage text,
  status text not null default 'active' check (status in ('active', 'paused', 'done', 'archived')),
  start_date date,
  due_date date,
  value_cents bigint check (value_cents is null or value_cents >= 0),
  briefing text,
  drive_folder_id text,
  zro_project_id uuid unique,
  link_status text not null default 'pending' check (link_status in ('unlinked', 'pending', 'linked', 'failed')),
  link_attempts integer not null default 0,
  link_last_error text,
  link_updated_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (org_id, code)
);
create index if not exists projects_org_client_idx on maestro.projects (org_id, client_id);
create index if not exists projects_link_pending_idx on maestro.projects (link_status) where link_status in ('pending', 'failed');
create or replace trigger projects_touch before update on maestro.projects for each row execute function maestro.touch_updated_at();

-- ───────────── Quadro ─────────────

-- Um documento jsonb por card, versão por campo em `versoes` (conflito por campo) e `versao` do card inteiro.
-- Colunas geradas só para índice e filtro; o valor de verdade é `dados`.
create table if not exists maestro.cards (
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_-]{4,64}$'),
  dados jsonb not null default '{}'::jsonb check (jsonb_typeof(dados) = 'object'),
  versao integer not null default 1,
  versoes jsonb not null default '{}'::jsonb,
  coluna text generated always as (dados ->> 'coluna') stored,
  cliente text generated always as (dados ->> 'cliente') stored,
  projeto text generated always as (dados ->> 'projeto') stored,
  resp text generated always as (dados ->> 'resp') stored,
  prazo text generated always as (dados ->> 'prazo') stored,
  data text generated always as (dados ->> 'data') stored,
  apagado_em text generated always as (dados ->> 'apagadoEm') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id)
);
create index if not exists cards_org_coluna_idx on maestro.cards (org_id, coluna);
create index if not exists cards_org_prazo_idx on maestro.cards (org_id, prazo);
create index if not exists cards_org_cliente_idx on maestro.cards (org_id, cliente);

create table if not exists maestro.card_history (
  n bigserial primary key,
  org_id uuid not null,
  card_id text not null,
  quando timestamptz not null default now(),
  quem uuid,
  operacao text not null check (operacao in ('criar', 'mudar', 'apagar', 'restaurar', 'decisao')),
  campos jsonb not null default '{}'::jsonb,
  foreign key (org_id, card_id) references maestro.cards (org_id, id) on delete cascade
);
create index if not exists card_history_card_idx on maestro.card_history (org_id, card_id, n);

-- Peças e referências: ficam em pastas do Google Drive da organização via SOBEDESCE (etapa 2). Aqui só o id do
-- arquivo, a pasta e a referência da miniatura. O Maestro não guarda bytes.
create table if not exists maestro.card_media (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  card_id text not null,
  tipo text not null default 'peca' check (tipo in ('peca', 'ref')),
  nome text not null check (length(nome) between 1 and 300),
  mime text,
  bytes bigint check (bytes is null or bytes >= 0),
  drive_file_id text not null check (drive_file_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  drive_folder_id text check (drive_folder_id is null or drive_folder_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  thumb_ref text,
  width integer,
  height integer,
  duration_s integer,
  posicao integer not null default 0,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  apagado_em timestamptz,
  foreign key (org_id, card_id) references maestro.cards (org_id, id) on delete cascade
);
create index if not exists card_media_card_idx on maestro.card_media (org_id, card_id, posicao);
create unique index if not exists card_media_arquivo_ativo_idx on maestro.card_media (org_id, card_id, drive_file_id) where apagado_em is null;

-- ───────────── aprovação do cliente ─────────────

create table if not exists maestro.lotes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  client_id uuid not null references maestro.clients (id),
  project_id uuid references maestro.projects (id) on delete set null,
  title text not null check (length(title) between 1 and 200),
  objective text,
  period text,
  status text not null default 'rascunho' check (status in ('rascunho', 'enviado', 'fechado')),
  sent_at timestamptz,
  closed_at timestamptz,
  term jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists lotes_org_client_idx on maestro.lotes (org_id, client_id);
create or replace trigger lotes_touch before update on maestro.lotes for each row execute function maestro.touch_updated_at();

create table if not exists maestro.lote_cards (
  lote_id uuid not null references maestro.lotes (id) on delete cascade,
  org_id uuid not null,
  card_id text not null,
  posicao integer not null default 0,
  volta integer not null default 1 check (volta >= 1),
  primary key (lote_id, card_id),
  foreign key (org_id, card_id) references maestro.cards (org_id, id) on delete cascade
);

-- Link do cliente (padrão drive_links do ZRO): token só como hash, validade padrão de 30 dias, PIN opcional,
-- revogação individual, uso registrado. Um link ativo por lote. Nunca apagado.
create table if not exists maestro.approval_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  client_id uuid not null references maestro.clients (id),
  kind text not null check (kind in ('lote', 'area', 'ver')),
  lote_id uuid references maestro.lotes (id) on delete cascade,
  card_id text,
  token_hash text not null unique,
  token_enc text,
  label text,
  approver_name text,
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked_at timestamptz,
  revoked_by uuid,
  pin_hash text,
  pin_version integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  uses integer not null default 0,
  check ((kind = 'lote') = (lote_id is not null)),
  check ((kind = 'ver') = (card_id is not null))
);
create index if not exists approval_links_org_idx on maestro.approval_links (org_id, client_id);
create unique index if not exists approval_links_um_ativo_por_lote on maestro.approval_links (lote_id) where kind = 'lote' and revoked_at is null;

-- Decisão do cliente num só passo (texto e peça juntos): imutável, com a versão exata do card que ele viu e chave de
-- idempotência (card + volta + link), para a fila offline nunca gravar duas vezes.
create table if not exists maestro.approvals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  card_id text not null,
  card_version integer not null,
  lote_id uuid,
  link_id uuid references maestro.approval_links (id),
  decision text not null check (decision in ('aprovado', 'ajuste')),
  note text check (note is null or length(note) <= 2000),
  pins jsonb not null default '[]'::jsonb check (jsonb_typeof(pins) = 'array'),
  before_media jsonb not null default '[]'::jsonb check (jsonb_typeof(before_media) = 'array'),
  approver_name text,
  ip_hash text,
  user_agent text,
  consent_at timestamptz,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  foreign key (org_id, card_id) references maestro.cards (org_id, id)
);
create index if not exists approvals_card_idx on maestro.approvals (org_id, card_id);

create table if not exists maestro.client_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  client_id uuid not null references maestro.clients (id),
  link_id uuid references maestro.approval_links (id),
  title text not null check (length(title) between 3 and 140),
  format text,
  wanted_for text,
  description text check (description is null or length(description) <= 3000),
  status text not null default 'novo' check (status in ('novo', 'aceito', 'recusado', 'feito')),
  card_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists client_requests_org_idx on maestro.client_requests (org_id, status);
create or replace trigger client_requests_touch before update on maestro.client_requests for each row execute function maestro.touch_updated_at();

-- ───────────── Absolute ZRO, auditoria e limites ─────────────

-- Espelho das etapas do projeto vinculado (zro.project_steps): só indicador; nunca move coluna nem decide pelo cliente.
create table if not exists maestro.integration_state (
  org_id uuid not null,
  project_id uuid not null references maestro.projects (id) on delete cascade,
  product_id text not null check (product_id ~ '^[a-z0-9-]+$'),
  state text not null,
  detail jsonb not null default '{}'::jsonb,
  synced_at timestamptz,
  hub_updated_at timestamptz,
  primary key (org_id, project_id, product_id)
);

create table if not exists maestro.audit_log (
  id bigserial primary key,
  org_id uuid not null,
  actor_sub uuid,
  action text not null check (action ~ '^[a-z0-9_.-]+$'),
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_org_idx on maestro.audit_log (org_id, created_at desc);

create table if not exists maestro.rate_limit_attempts (
  key text not null,
  at timestamptz not null default now()
);
create index if not exists rate_limit_attempts_idx on maestro.rate_limit_attempts (key, at);

-- ───────────── só inclusão ─────────────

create or replace function maestro.somente_inclusao() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% é somente inclusão.', tg_table_name using errcode = '42501';
end
$$;
drop trigger if exists card_history_append_only on maestro.card_history;
create trigger card_history_append_only before update or delete on maestro.card_history for each row execute function maestro.somente_inclusao();
drop trigger if exists approvals_append_only on maestro.approvals;
create trigger approvals_append_only before update or delete on maestro.approvals for each row execute function maestro.somente_inclusao();
drop trigger if exists audit_log_append_only on maestro.audit_log;
create trigger audit_log_append_only before update or delete on maestro.audit_log for each row execute function maestro.somente_inclusao();

-- ───────────── funções de checagem (security definer: leem vínculos sem recursão de RLS) ─────────────

create or replace function maestro.member_role(p_org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role
  from maestro.members m
  join maestro.organizations o on o.id = m.org_id
  where m.org_id = p_org and m.zro_sub = maestro.current_sub() and m.status = 'active'
$$;

create or replace function maestro.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_org is not null and p_org = maestro.current_org_id() and maestro.member_role(p_org) is not null
$$;

create or replace function maestro.has_role(p_org uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(maestro.is_member(p_org) and maestro.member_role(p_org) = any (p_roles), false)
$$;

-- ───────────── escrita de cards só por função ─────────────

-- Quem pode mexer no Quadro: admin, gestor e equipe. Leitura só lê.
create or replace function maestro.exigir_escrita_no_quadro() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := maestro.current_org_id();
begin
  if v_org is null or not maestro.has_role(v_org, array['admin', 'gestor', 'equipe']) then
    raise exception 'Sem permissão para mudar o Quadro.' using errcode = '42501';
  end if;
  return v_org;
end
$$;

create or replace function maestro.card_criar(p_id text, p_dados jsonb) returns maestro.cards
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := maestro.exigir_escrita_no_quadro();
  v_versoes jsonb;
  v_card maestro.cards;
begin
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'dados precisa ser um objeto.' using errcode = 'P0001';
  end if;
  select coalesce(jsonb_object_agg(k, 1), '{}'::jsonb) into v_versoes from jsonb_object_keys(p_dados) as k;
  insert into maestro.cards (org_id, id, dados, versao, versoes)
    values (v_org, p_id, p_dados, 1, v_versoes)
    returning * into v_card;
  insert into maestro.card_history (org_id, card_id, quem, operacao, campos)
    values (v_org, p_id, maestro.current_sub(), 'criar', (select coalesce(jsonb_object_agg(k, jsonb_build_array(null, p_dados -> k)), '{}'::jsonb) from jsonb_object_keys(p_dados) as k));
  return v_card;
end
$$;

-- Muda campos de um card. `p_base` (opcional) traz a versão de cada campo que a pessoa viu: se outra pessoa mudou o
-- mesmo campo antes, a mudança é recusada ('conflito:<campo>') e a tela recarrega. Valor JSON null apaga o campo.
create or replace function maestro.card_mudar(p_id text, p_campos jsonb, p_base jsonb default null) returns maestro.cards
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := maestro.exigir_escrita_no_quadro();
  v_card maestro.cards;
  v_chave text;
  v_dados jsonb;
  v_versoes jsonb;
  v_historico jsonb := '{}'::jsonb;
begin
  if p_campos is null or jsonb_typeof(p_campos) <> 'object' then
    raise exception 'campos precisa ser um objeto.' using errcode = 'P0001';
  end if;
  select * into v_card from maestro.cards c where c.org_id = v_org and c.id = p_id for update;
  if not found then
    raise exception 'Card não encontrado.' using errcode = 'P0002';
  end if;
  v_dados := v_card.dados;
  v_versoes := v_card.versoes;
  for v_chave in select jsonb_object_keys(p_campos) loop
    if p_base is not null and p_base ? v_chave and coalesce((v_versoes ->> v_chave)::int, 0) <> (p_base ->> v_chave)::int then
      raise exception 'conflito:%', v_chave using errcode = 'P0001';
    end if;
    if v_dados -> v_chave is distinct from p_campos -> v_chave then
      v_historico := v_historico || jsonb_build_object(v_chave, jsonb_build_array(v_dados -> v_chave, p_campos -> v_chave));
      if jsonb_typeof(p_campos -> v_chave) = 'null' then
        v_dados := v_dados - v_chave;
      else
        v_dados := jsonb_set(v_dados, array[v_chave], p_campos -> v_chave, true);
      end if;
      v_versoes := jsonb_set(v_versoes, array[v_chave], to_jsonb(coalesce((v_versoes ->> v_chave)::int, 0) + 1), true);
    end if;
  end loop;
  if v_historico = '{}'::jsonb then
    return v_card;
  end if;
  update maestro.cards c
     set dados = v_dados, versoes = v_versoes, versao = c.versao + 1, updated_at = now()
   where c.org_id = v_org and c.id = p_id
   returning * into v_card;
  insert into maestro.card_history (org_id, card_id, quem, operacao, campos)
    values (v_org, p_id, maestro.current_sub(), 'mudar', v_historico);
  return v_card;
end
$$;

-- Apagar é lápide (dados.apagadoEm); restaurar tira a lápide. Nada some do banco.
create or replace function maestro.card_apagar(p_id text) returns maestro.cards
language plpgsql security definer set search_path = '' as $$
declare v_card maestro.cards;
begin
  v_card := maestro.card_mudar(p_id, jsonb_build_object('apagadoEm', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'apagadoPor', maestro.current_sub()));
  insert into maestro.card_history (org_id, card_id, quem, operacao, campos)
    values (v_card.org_id, p_id, maestro.current_sub(), 'apagar', '{}'::jsonb);
  return v_card;
end
$$;

create or replace function maestro.card_restaurar(p_id text) returns maestro.cards
language plpgsql security definer set search_path = '' as $$
declare v_card maestro.cards;
begin
  v_card := maestro.card_mudar(p_id, '{"apagadoEm": null, "apagadoPor": null}'::jsonb);
  insert into maestro.card_history (org_id, card_id, quem, operacao, campos)
    values (v_card.org_id, p_id, maestro.current_sub(), 'restaurar', '{}'::jsonb);
  return v_card;
end
$$;

revoke all on all functions in schema maestro from public;
grant execute on function
  maestro.current_sub(), maestro.current_org_id(), maestro.member_role(uuid), maestro.is_member(uuid), maestro.has_role(uuid, text[]),
  maestro.exigir_escrita_no_quadro(), maestro.card_criar(text, jsonb), maestro.card_mudar(text, jsonb, jsonb),
  maestro.card_apagar(text), maestro.card_restaurar(text)
to maestro_app;

-- ───────────── RLS em todas as tabelas ─────────────

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'maestro' and tablename <> '__drizzle_migrations' loop
    execute format('alter table maestro.%I enable row level security', t);
  end loop;
end
$$;

-- Sessões, tentativas e migrações: nenhum privilégio para maestro_app (só o sistema).
revoke all on maestro.sessions, maestro.rate_limit_attempts, maestro.__drizzle_migrations from maestro_app;

-- Isolamento por organização em toda tabela de negócio: linha da organização ativa E vínculo ativo da pessoa, nas
-- leituras (using) e nas escritas (with check). Trocar a organização ativa nunca mostra dados de outra.
do $$
declare t text;
begin
  foreach t in array array['members', 'clients', 'projects', 'cards', 'card_history', 'card_media', 'lotes', 'lote_cards',
                           'approval_links', 'approvals', 'client_requests', 'integration_state', 'audit_log', 'sessions', 'rate_limit_attempts'] loop
    execute format('drop policy if exists %I on maestro.%I', t || '_org', t);
    if t = 'rate_limit_attempts' then
      -- Sem org_id: ninguém além do dono lê ou escreve (privilégios revogados acima); a política fecha de vez.
      execute format('create policy %I on maestro.%I for all to maestro_app using (false) with check (false)', t || '_org', t);
    else
      execute format('create policy %I on maestro.%I for all to maestro_app using (org_id = maestro.current_org_id() and maestro.is_member(org_id)) with check (org_id = maestro.current_org_id() and maestro.is_member(org_id))', t || '_org', t);
    end if;
  end loop;
end
$$;

drop policy if exists organizations_org on maestro.organizations;
create policy organizations_org on maestro.organizations for all to maestro_app
  using (id = maestro.current_org_id() and maestro.is_member(id))
  with check (id = maestro.current_org_id() and maestro.is_member(id));

-- Papéis (políticas restritivas: somam-se ao isolamento acima).
-- organizations: só admin muda nome e ajustes.
drop policy if exists organizations_admin on maestro.organizations;
create policy organizations_admin on maestro.organizations as restrictive for update to maestro_app
  using (maestro.has_role(id, array['admin'])) with check (maestro.has_role(id, array['admin']));
-- members: só admin ajusta revisor e função (as colunas permitidas estão no grant); papel e hub_role vêm do login.
drop policy if exists members_admin on maestro.members;
create policy members_admin on maestro.members as restrictive for update to maestro_app
  using (maestro.has_role(org_id, array['admin'])) with check (maestro.has_role(org_id, array['admin']));
-- Clientes, projetos, lotes, peças, pedidos e espelho: admin, gestor e equipe escrevem; leitura só lê.
do $$
declare t text;
begin
  foreach t in array array['clients', 'projects', 'card_media', 'lotes', 'lote_cards', 'client_requests', 'integration_state'] loop
    execute format('drop policy if exists %I on maestro.%I', t || '_escrita', t);
    execute format('create policy %I on maestro.%I as restrictive for insert to maestro_app with check (maestro.has_role(org_id, array[''admin'', ''gestor'', ''equipe'']))', t || '_escrita', t);
    execute format('drop policy if exists %I on maestro.%I', t || '_mudanca', t);
    execute format('create policy %I on maestro.%I as restrictive for update to maestro_app using (maestro.has_role(org_id, array[''admin'', ''gestor'', ''equipe''])) with check (maestro.has_role(org_id, array[''admin'', ''gestor'', ''equipe'']))', t || '_mudanca', t);
    execute format('drop policy if exists %I on maestro.%I', t || '_remocao', t);
    execute format('create policy %I on maestro.%I as restrictive for delete to maestro_app using (maestro.has_role(org_id, array[''admin'', ''gestor'']))', t || '_remocao', t);
  end loop;
end
$$;
-- Links do cliente: só admin e gestor criam e revogam (nunca apagam).
drop policy if exists approval_links_escrita on maestro.approval_links;
create policy approval_links_escrita on maestro.approval_links as restrictive for insert to maestro_app
  with check (maestro.has_role(org_id, array['admin', 'gestor']));
drop policy if exists approval_links_mudanca on maestro.approval_links;
create policy approval_links_mudanca on maestro.approval_links as restrictive for update to maestro_app
  using (maestro.has_role(org_id, array['admin', 'gestor'])) with check (maestro.has_role(org_id, array['admin', 'gestor']));
-- Auditoria: quem escreve assina com o próprio sub; só admin e gestor leem.
drop policy if exists audit_log_autor on maestro.audit_log;
create policy audit_log_autor on maestro.audit_log as restrictive for insert to maestro_app with check (actor_sub = maestro.current_sub());
drop policy if exists audit_log_leitura on maestro.audit_log;
create policy audit_log_leitura on maestro.audit_log as restrictive for select to maestro_app using (maestro.has_role(org_id, array['admin', 'gestor']));

-- ───────────── privilégios de maestro_app ─────────────

grant select on maestro.organizations to maestro_app;
grant update (name, settings) on maestro.organizations to maestro_app;
grant select on maestro.members to maestro_app;
grant update (revisor, funcao) on maestro.members to maestro_app;
grant select, insert, update, delete on maestro.clients, maestro.projects, maestro.card_media, maestro.lotes, maestro.lote_cards,
  maestro.client_requests, maestro.integration_state to maestro_app;
grant select, insert, update on maestro.approval_links to maestro_app;
-- Quadro: leitura direta; escrita só pelas funções card_* (security definer).
grant select on maestro.cards, maestro.card_history to maestro_app;
-- Decisões do cliente entram pela porta de sistema (link resolvido no servidor); a equipe só lê.
grant select on maestro.approvals to maestro_app;
grant select, insert on maestro.audit_log to maestro_app;
grant usage, select on all sequences in schema maestro to maestro_app;
;
insert into "maestro"."__drizzle_migrations" (hash, created_at) values ('085d1655043470efed675b5c836f31ed0342a81131699c462fc59e1883ff66a5', 1793145600000);

-- ===== 0001_release_na_sessao =====
set local search_path to "maestro", pg_catalog;
-- Maestro · 0001 · a claim zro_release (gate de lançamento, ADR 0023 do HUB) passa a ficar na sessão (28/10/2026).
-- temAcesso() confere em todo pedido: "released" ou "allowed" entra; "closed" ou sem a claim, não. Vem do login e de
-- cada releitura do perfil (/api/zro/eu). Sessões de antes desta migração ficam com null (fechado) até a releitura.
alter table maestro.sessions add column if not exists zro_release jsonb;
;
insert into "maestro"."__drizzle_migrations" (hash, created_at) values ('11a5071f3336d78203095408896236a41a3ffbfede259678d6f423f519f6485d', 1793232000000);

-- ===== 0002_crm_quadro_projetos =====
set local search_path to "maestro", pg_catalog;
-- Maestro · 0002 · Etapa 1 (28/10/2026): Quadro de pauta funcionando, Clientes (CRM básico) e Projetos.
-- Só acrescenta: nenhuma tabela, função ou política das migrações 0000/0001 é editada. RLS e papéis continuam os da 0000
-- (admin, gestor e equipe escrevem em clientes e projetos; leitura só lê; cards só pelas funções card_*).

-- ───────────── clientes: o cadastro do CRM ─────────────
-- name = nome do cliente (como a equipe chama); company = razão/empresa; contact_name = a pessoa de contato.
alter table maestro.clients add column if not exists company text;
alter table maestro.clients add column if not exists whatsapp text;
alter table maestro.clients add column if not exists status text not null default 'ativo';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_status_ok' and conrelid = 'maestro.clients'::regclass) then
    alter table maestro.clients add constraint clients_status_ok check (status in ('lead', 'ativo', 'pausado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clients_textos_ok' and conrelid = 'maestro.clients'::regclass) then
    alter table maestro.clients add constraint clients_textos_ok check (
      (company is null or length(company) <= 200)
      and (contact_name is null or length(contact_name) <= 200)
      and (email is null or length(email) <= 254)
      and (whatsapp is null or whatsapp ~ '^[0-9]{8,15}$')
      and (notes is null or length(notes) <= 5000)
    ) not valid;
  end if;
end
$$;
create index if not exists clients_org_status_idx on maestro.clients (org_id, status) where deleted_at is null;

-- ───────────── projetos ─────────────
create index if not exists projects_org_status_idx on maestro.projects (org_id, status) where deleted_at is null;

-- ───────────── Quadro ─────────────
-- A coluna do card é sempre uma das 8 do método (src/lib/quadro/metodo.ts). `not valid`: cards antigos não travam.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cards_coluna_ok' and conrelid = 'maestro.cards'::regclass) then
    alter table maestro.cards add constraint cards_coluna_ok check (
      dados ->> 'coluna' is null
      or dados ->> 'coluna' in ('pauta', 'afazer', 'fazendo', 'revisao', 'aprovacao', 'aprovado', 'agendado', 'entregue')
    ) not valid;
  end if;
end
$$;
-- "O que mudou desde": o Quadro pergunta a cada poucos segundos (tempo real simples).
create index if not exists cards_org_updated_idx on maestro.cards (org_id, updated_at);
create index if not exists cards_org_projeto_idx on maestro.cards (org_id, projeto);
;
insert into "maestro"."__drizzle_migrations" (hash, created_at) values ('52b371a95cd4121ee82f56a9dee54ff4e1d8fca80960940b3be35e29c625dea0', 1793318400000);

-- ===== 0003_demonstracao =====
set local search_path to "maestro", pg_catalog;
-- Maestro · 0003 · Demonstração (28/10/2026): o botão "Carregar demonstração" monta uma produtora de exemplo na
-- organização ativa, e "Remover demonstração" tira só o que ele criou. Só acrescenta: nada das 0000–0002 é editado.
--
-- Marca: clientes, projetos e lotes ganham `demo` (falso por padrão); cards de demonstração têm id `demo-…` e
-- `dados.demo = true` (a tela e a API do Quadro não gravam esse campo, então ninguém marca um card de verdade por engano).

alter table maestro.clients add column if not exists demo boolean not null default false;
alter table maestro.projects add column if not exists demo boolean not null default false;
alter table maestro.lotes add column if not exists demo boolean not null default false;
create index if not exists clients_org_demo_idx on maestro.clients (org_id) where demo;
create index if not exists projects_org_demo_idx on maestro.projects (org_id) where demo;
create index if not exists lotes_org_demo_idx on maestro.lotes (org_id) where demo;

-- Só inclusão continua valendo, com uma exceção estreita: dentro de maestro.demo_apagar_cards() (que liga
-- `maestro.limpando_demo` só na própria transação) o histórico dos cards de demonstração sai junto com eles.
-- maestro_app não tem delete em card_history nem em cards; só a função (security definer) chega aqui.
create or replace function maestro.somente_inclusao() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- IFs aninhados: `old.card_id` só é lido nas tabelas que têm a coluna (audit_log não tem).
  if tg_op = 'DELETE' and tg_table_name in ('card_history', 'approvals')
     and coalesce(current_setting('maestro.limpando_demo', true), '') = 'on' then
    if old.card_id like 'demo-%' then
      return old;
    end if;
  end if;
  raise exception '% é somente inclusão.', tg_table_name using errcode = '42501';
end
$$;

-- Apaga de vez os cards de demonstração da organização ativa (com histórico, peças e itens de lote). Só admin e gestão,
-- como a remoção de clientes e projetos. Devolve quantos cards saíram.
create or replace function maestro.demo_apagar_cards() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := maestro.current_org_id();
  v_n integer;
begin
  if v_org is null or not maestro.has_role(v_org, array['admin', 'gestor']) then
    raise exception 'Só administração e gestão removem a demonstração.' using errcode = '42501';
  end if;
  perform set_config('maestro.limpando_demo', 'on', true);
  delete from maestro.approvals a
   using maestro.cards c
   where a.org_id = v_org and c.org_id = v_org and c.id = a.card_id and c.id like 'demo-%' and c.dados ->> 'demo' = 'true';
  delete from maestro.cards c where c.org_id = v_org and c.id like 'demo-%' and c.dados ->> 'demo' = 'true';
  get diagnostics v_n = row_count;
  perform set_config('maestro.limpando_demo', 'off', true);
  return v_n;
end
$$;

revoke all on function maestro.demo_apagar_cards() from public;
grant execute on function maestro.demo_apagar_cards() to maestro_app;
;
insert into "maestro"."__drizzle_migrations" (hash, created_at) values ('e6e899d643b9b59b4137a02907d5673c6cbffacb9cfa26bd4c65c9904d57d9d7', 1793404800000);

-- ===== 0004_lista_espera =====
set local search_path to "maestro", pg_catalog;
-- Maestro · 0004 · Lista de espera da página inicial (decisão do titular, 28/10/2026; plano v2 §10 e §13.4).
-- O Maestro está fechado (migration 0024 do HUB): quem não tem acesso deixa o e-mail, com consentimento, e a liberação
-- continua manual, pela lista de acesso do HUB. Só acrescenta: nada das 0000–0003 é editado.
--
-- Porta estreita: a tabela não tem nenhum privilégio para maestro_app (nem leitura) e o RLS fecha tudo. A única entrada
-- é maestro.lista_espera_entrar() (security definer), que só insere e devolve se a linha é nova. Mesmo e-mail de novo
-- não duplica nem conta que já estava (a resposta da tela é a mesma). Ler a lista é só do dono do schema (console).

create table if not exists maestro.lista_espera (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) between 6 and 254 and email = lower(email)),
  nome text check (nome is null or char_length(nome) between 1 and 80),
  consentimento_em timestamptz not null,
  -- sha256 do IP com chave (nunca o IP): só para conferir abuso.
  ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create unique index if not exists lista_espera_email_uq on maestro.lista_espera (email);

alter table maestro.lista_espera enable row level security;
revoke all on maestro.lista_espera from public;
revoke all on maestro.lista_espera from maestro_app;
drop policy if exists lista_espera_fechada on maestro.lista_espera;
create policy lista_espera_fechada on maestro.lista_espera for all to maestro_app using (false) with check (false);

-- No Supabase, os papéis da API pública também ficam de fora (o schema nem é exposto; isto é cinto e suspensório).
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on maestro.lista_espera from %I', r);
    end if;
  end loop;
end
$$;

-- Entra na lista: e-mail normalizado e conferido, nome opcional (até 80), consentimento obrigatório. true = linha nova;
-- false = o e-mail já estava (nada muda). Não lê nada além da própria inserção.
create or replace function maestro.lista_espera_entrar(p_email text, p_nome text, p_consentimento boolean, p_ip_hash text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_nome text := nullif(left(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), 80), '');
  v_id uuid;
begin
  if p_consentimento is distinct from true then
    raise exception 'Sem consentimento, o e-mail não entra na lista.' using errcode = '22023';
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido.' using errcode = '22023';
  end if;
  if p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$' then
    p_ip_hash := null;
  end if;
  insert into maestro.lista_espera (email, nome, consentimento_em, ip_hash)
  values (v_email, v_nome, now(), p_ip_hash)
  on conflict (email) do nothing
  returning id into v_id;
  return v_id is not null;
end
$$;

revoke all on function maestro.lista_espera_entrar(text, text, boolean, text) from public;
grant execute on function maestro.lista_espera_entrar(text, text, boolean, text) to maestro_app;
;
insert into "maestro"."__drizzle_migrations" (hash, created_at) values ('9430d18ecc7c54405c86e21548a45d0dd780f0f5ab90a0ef1a45e8519cc8d4e1', 1793491200000);

-- ===== 0005_revisao =====
set local search_path to "maestro", pg_catalog;
-- Maestro · 0005 · Revisão de vídeo e aprovação do cliente (plano v2 §4, fases 3–6; ADR 0024). Só acrescenta: nada das
-- 0000–0004 é editado.
--
-- Decisão do titular: a peça é um LINK que a equipe cadastra (Drive, YouTube, Vimeo, Dropbox, mp4 direto, HLS); o Maestro
-- não guarda bytes. Cada link vira uma versão do card (`versoes`, n = volta). Comentários com tempo (ms), intervalo e
-- pino x/y (`comentarios`, só crescem: o texto nunca muda, só o "resolvido"). A decisão continua em `approvals`
-- (imutável, idempotente), agora com a versão e a volta.
--
-- Equipe: lê pelo RLS (org ativa + vínculo) e escreve só pelas funções `versao_*` e `comentario_*` (admin, gestor e
-- equipe; leitura só lê). Links: admin e gestor criam e revogam (políticas da 0000).
-- Cliente (sem conta): nunca usa asUser. Entra pela "porta estreita": `link_pin`, `link_abrir`, `link_comentar` e
-- `link_enviar` (security definer) conferem o sha256 do token, a validade, a revogação, o lote aberto e o PIN (conferido
-- no servidor com scrypt; a função recebe só o resultado) e tocam apenas as linhas do lote do link. O token nunca volta
-- na resposta; nada de e-mail, sub, id de outro lote ou de outro cliente.

-- ───────────── decisões: a versão e a volta ─────────────
alter table maestro.approvals add column if not exists versao_id uuid;
alter table maestro.approvals add column if not exists volta integer;

-- ───────────── versões de uma peça ─────────────
create table if not exists maestro.versoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  card_id text not null,
  n integer not null check (n >= 1),
  titulo text check (titulo is null or char_length(titulo) between 1 and 200),
  fonte text not null check (fonte in ('drive', 'youtube', 'vimeo', 'dropbox', 'mp4', 'hls', 'link')),
  -- https sempre; a única exceção são os vídeos sintéticos da demonstração, servidos pelo próprio Maestro
  -- (public/demo/*.mp4), e só em card `demo-…`.
  url text not null check (
    (char_length(url) between 12 and 2000 and url like 'https://%')
    or (card_id like 'demo-%' and url ~ '^/demo/[a-z0-9-]{1,60}\.mp4$')
  ),
  drive_file_id text check (drive_file_id is null or drive_file_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  drive_resource_key text check (drive_resource_key is null or drive_resource_key ~ '^[A-Za-z0-9_-]{1,200}$'),
  duracao_ms integer check (duracao_ms is null or duracao_ms between 0 and 86400000),
  fps numeric(6, 3) check (fps is null or (fps > 0 and fps <= 240)),
  largura integer check (largura is null or largura between 1 and 16384),
  altura integer check (altura is null or altura between 1 and 16384),
  miniatura_url text check (miniatura_url is null or (char_length(miniatura_url) <= 2000 and miniatura_url like 'https://%')),
  -- o que o SOBEDESCE mudou no compartilhamento do arquivo (fase 8), para desfazer ao revogar.
  compartilhamento jsonb,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  apagado_em timestamptz,
  foreign key (org_id, card_id) references maestro.cards (org_id, id) on delete cascade
);
-- O número nunca se repete, nem depois de apagar (a volta do cliente segue o número).
create unique index if not exists versoes_card_n_uq on maestro.versoes (org_id, card_id, n);

-- ───────────── comentários (tempo, intervalo e pino) ─────────────
create table if not exists maestro.comentarios (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  versao_id uuid not null references maestro.versoes (id) on delete cascade,
  card_id text not null,
  pai_id uuid references maestro.comentarios (id) on delete cascade,
  autor_tipo text not null check (autor_tipo in ('equipe', 'cliente')),
  autor_sub uuid,
  link_id uuid,
  autor_nome text check (autor_nome is null or char_length(autor_nome) between 1 and 80),
  t_ms integer check (t_ms is null or t_ms between 0 and 86400000),
  t_fim_ms integer check (t_fim_ms is null or (t_ms is not null and t_fim_ms > t_ms and t_fim_ms <= 86400000)),
  tempo_digitado boolean not null default false,
  x numeric(5, 2) check (x is null or x between 0 and 100),
  y numeric(5, 2) check (y is null or y between 0 and 100),
  texto text not null check (char_length(texto) between 1 and 2000),
  resolvido_em timestamptz,
  resolvido_por uuid,
  criado_em timestamptz not null default now(),
  idem_key text not null check (char_length(idem_key) between 8 and 120),
  unique (org_id, idem_key),
  check ((x is null) = (y is null)),
  check ((autor_tipo = 'equipe') = (autor_sub is not null)),
  check ((autor_tipo = 'cliente') = (link_id is not null))
);
create index if not exists comentarios_versao_idx on maestro.comentarios (org_id, versao_id, criado_em);

-- O texto do comentário nunca muda e nada some; só "resolvido" vai e volta. Exceção estreita: a limpeza da
-- demonstração (maestro.demo_apagar_cards, 0003) leva junto os comentários dos cards `demo-…`.
create or replace function maestro.comentario_guarda() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'resolvido_em' - 'resolvido_por') = (to_jsonb(old) - 'resolvido_em' - 'resolvido_por') then
      return new;
    end if;
  elsif tg_op = 'DELETE' then
    if coalesce(current_setting('maestro.limpando_demo', true), '') = 'on' and old.card_id like 'demo-%' then
      return old;
    end if;
  end if;
  raise exception 'comentarios: o texto não muda e nada é apagado.' using errcode = '42501';
end
$$;
drop trigger if exists comentarios_guarda on maestro.comentarios;
create trigger comentarios_guarda before update or delete on maestro.comentarios for each row execute function maestro.comentario_guarda();

-- ───────────── RLS ─────────────
alter table maestro.versoes enable row level security;
alter table maestro.comentarios enable row level security;
do $$
declare t text;
begin
  foreach t in array array['versoes', 'comentarios'] loop
    execute format('drop policy if exists %I on maestro.%I', t || '_org', t);
    execute format('create policy %I on maestro.%I for all to maestro_app using (org_id = maestro.current_org_id() and maestro.is_member(org_id)) with check (org_id = maestro.current_org_id() and maestro.is_member(org_id))', t || '_org', t);
  end loop;
end
$$;
revoke all on maestro.versoes, maestro.comentarios from public;
-- Leitura direta; escrita só pelas funções abaixo (security definer).
grant select on maestro.versoes, maestro.comentarios to maestro_app;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on maestro.versoes, maestro.comentarios from %I', r);
    end if;
  end loop;
end
$$;

-- ───────────── equipe: versões e comentários ─────────────

-- Nova versão de um card: o número é o próximo (trava por card) e a volta dos lotes abertos com o card sobe junto, para
-- o cliente decidir de novo sobre a versão nova. A forma do link (fonte, https, ids do Drive) vem conferida do servidor
-- (src/lib/revisao/fontes) e o banco confere de novo pelos checks.
create or replace function maestro.versao_criar(p_card text, p_fonte text, p_url text, p_meta jsonb default '{}'::jsonb)
returns maestro.versoes
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := maestro.exigir_escrita_no_quadro();
  v_n integer;
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
  v_versao maestro.versoes;
begin
  if jsonb_typeof(v_meta) <> 'object' then
    raise exception 'meta precisa ser um objeto.' using errcode = 'P0001';
  end if;
  perform 1 from maestro.cards c where c.org_id = v_org and c.id = p_card and c.apagado_em is null;
  if not found then
    raise exception 'Card não encontrado.' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('versao:' || v_org::text || ':' || p_card, 0));
  select coalesce(max(v.n), 0) + 1 into v_n from maestro.versoes v where v.org_id = v_org and v.card_id = p_card;
  insert into maestro.versoes (org_id, card_id, n, titulo, fonte, url, drive_file_id, drive_resource_key, duracao_ms, fps, largura, altura, miniatura_url, criado_por)
  values (
    v_org, p_card, v_n,
    nullif(btrim(v_meta ->> 'titulo'), ''),
    p_fonte, p_url,
    nullif(v_meta ->> 'drive_file_id', ''),
    nullif(v_meta ->> 'drive_resource_key', ''),
    (v_meta ->> 'duracao_ms')::integer,
    (v_meta ->> 'fps')::numeric,
    (v_meta ->> 'largura')::integer,
    (v_meta ->> 'altura')::integer,
    nullif(v_meta ->> 'miniatura_url', ''),
    maestro.current_sub()
  )
  returning * into v_versao;
  update maestro.lote_cards lc set volta = v_n
    from maestro.lotes l
   where lc.org_id = v_org and lc.card_id = p_card and l.id = lc.lote_id and l.org_id = v_org
     and l.status <> 'fechado' and l.deleted_at is null and lc.volta < v_n;
  insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
    values (v_org, maestro.current_sub(), 'versao.criar', 'card', p_card, jsonb_build_object('n', v_n, 'fonte', p_fonte));
  return v_versao;
end
$$;

-- Tira uma versão da lista (lápide). O número não volta.
create or replace function maestro.versao_apagar(p_id uuid) returns maestro.versoes
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := maestro.exigir_escrita_no_quadro();
  v_versao maestro.versoes;
begin
  update maestro.versoes v set apagado_em = now()
   where v.org_id = v_org and v.id = p_id and v.apagado_em is null
   returning * into v_versao;
  if not found then
    raise exception 'Versão não encontrada.' using errcode = 'P0002';
  end if;
  insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
    values (v_org, maestro.current_sub(), 'versao.apagar', 'card', v_versao.card_id, jsonb_build_object('n', v_versao.n));
  return v_versao;
end
$$;

-- Comentário da equipe (ou resposta em fio). Mesma chave de idempotência = o mesmo comentário (a fila não duplica).
create or replace function maestro.comentario_criar(p_versao uuid, p_dados jsonb) returns maestro.comentarios
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := maestro.exigir_escrita_no_quadro();
  v_d jsonb := coalesce(p_dados, '{}'::jsonb);
  v_versao maestro.versoes;
  v_c maestro.comentarios;
  v_idem text := 'e:' || coalesce(v_d ->> 'idem', '');
begin
  select * into v_versao from maestro.versoes v where v.org_id = v_org and v.id = p_versao and v.apagado_em is null;
  if not found then
    raise exception 'Versão não encontrada.' using errcode = 'P0002';
  end if;
  if (v_d ->> 'pai') is not null then
    perform 1 from maestro.comentarios k where k.org_id = v_org and k.id = (v_d ->> 'pai')::uuid and k.versao_id = p_versao;
    if not found then
      raise exception 'Comentário de origem não encontrado.' using errcode = 'P0002';
    end if;
  end if;
  select * into v_c from maestro.comentarios k where k.org_id = v_org and k.idem_key = v_idem;
  if found then
    return v_c;
  end if;
  insert into maestro.comentarios (org_id, versao_id, card_id, pai_id, autor_tipo, autor_sub, autor_nome, t_ms, t_fim_ms, tempo_digitado, x, y, texto, idem_key)
  values (
    v_org, p_versao, v_versao.card_id, (v_d ->> 'pai')::uuid, 'equipe', maestro.current_sub(),
    nullif(left(btrim(coalesce(v_d ->> 'nome', '')), 80), ''),
    (v_d ->> 't_ms')::integer, (v_d ->> 't_fim_ms')::integer, coalesce((v_d ->> 'digitado')::boolean, false),
    (v_d ->> 'x')::numeric, (v_d ->> 'y')::numeric,
    btrim(coalesce(v_d ->> 'texto', '')), v_idem
  )
  returning * into v_c;
  return v_c;
end
$$;

-- Resolver (ou reabrir) um comentário. O texto não muda.
create or replace function maestro.comentario_resolver(p_id uuid, p_resolvido boolean) returns maestro.comentarios
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := maestro.exigir_escrita_no_quadro();
  v_c maestro.comentarios;
begin
  update maestro.comentarios k
     set resolvido_em = case when p_resolvido then coalesce(k.resolvido_em, now()) else null end,
         resolvido_por = case when p_resolvido then coalesce(k.resolvido_por, maestro.current_sub()) else null end
   where k.org_id = v_org and k.id = p_id
   returning * into v_c;
  if not found then
    raise exception 'Comentário não encontrado.' using errcode = 'P0002';
  end if;
  insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
    values (v_org, maestro.current_sub(), case when p_resolvido then 'comentario.resolver' else 'comentario.reabrir' end, 'comentario', p_id::text, '{}'::jsonb);
  return v_c;
end
$$;

-- ───────────── cliente: a porta estreita ─────────────

-- O link de lote vivo do hash: não revogado, dentro da validade, lote existente e aberto. Interna (sem grant).
create or replace function maestro.link_vivo(p_token_hash text) returns maestro.approval_links
language sql stable security definer set search_path = '' as $$
  select a.*
    from maestro.approval_links a
    join maestro.lotes l on l.id = a.lote_id and l.org_id = a.org_id
   where p_token_hash ~ '^[0-9a-f]{64}$'
     and a.token_hash = p_token_hash
     and a.kind = 'lote'
     and a.revoked_at is null
     and a.expires_at > now()
     and l.deleted_at is null
     and l.status <> 'fechado'
$$;

-- O que o servidor precisa para conferir o PIN (scrypt, no servidor). Link morto = null.
create or replace function maestro.link_pin(p_token_hash text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_l maestro.approval_links;
begin
  v_l := maestro.link_vivo(p_token_hash);
  if v_l.id is null then
    return null;
  end if;
  return jsonb_build_object('link', v_l.id, 'pin', v_l.pin_hash, 'pin_versao', v_l.pin_version);
end
$$;

-- Comentários de uma versão como o cliente vê: sem sub, sem link, sem e-mail; a equipe aparece como "equipe".
create or replace function maestro.link_comentarios_json(p_org uuid, p_versao uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', k.id, 'pai', k.pai_id, 'autor', k.autor_tipo,
           'nome', case when k.autor_tipo = 'cliente' then k.autor_nome end,
           't', k.t_ms, 'tFim', k.t_fim_ms, 'digitado', k.tempo_digitado, 'x', k.x, 'y', k.y,
           'texto', k.texto, 'resolvido', k.resolvido_em is not null, 'em', k.criado_em
         ) order by k.criado_em, k.id), '[]'::jsonb)
    from maestro.comentarios k
   where k.org_id = p_org and k.versao_id = p_versao
$$;

-- Abre o lote do link. null = link morto (a tela é neutra). Com PIN e sem a prova: só {"estado":"pin"}.
create or replace function maestro.link_abrir(p_token_hash text, p_pin_ok boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l maestro.approval_links;
  v_lote maestro.lotes;
  v_r jsonb;
begin
  v_l := maestro.link_vivo(p_token_hash);
  if v_l.id is null then
    return null;
  end if;
  if v_l.pin_hash is not null and p_pin_ok is distinct from true then
    return jsonb_build_object('estado', 'pin');
  end if;
  select * into v_lote from maestro.lotes l where l.id = v_l.lote_id;
  -- Uso: no máximo uma auditoria de abertura a cada 10 minutos por link (abrir de novo não enche o log).
  if v_l.last_used_at is null or v_l.last_used_at < now() - interval '10 minutes' then
    insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
      values (v_l.org_id, null, 'link.abrir', 'lote', v_l.lote_id::text, jsonb_build_object('link', v_l.id));
  end if;
  update maestro.approval_links a set uses = a.uses + 1, last_used_at = now() where a.id = v_l.id;

  select jsonb_build_object(
    'estado', 'ok',
    'produtora', o.name,
    'cliente', c.name,
    'lote', jsonb_build_object('titulo', v_lote.title, 'objetivo', v_lote.objective, 'periodo', v_lote.period, 'enviadoEm', v_lote.sent_at),
    'expira', v_l.expires_at,
    'termo', case when v_lote.term ? 'nome' then jsonb_build_object('nome', v_lote.term ->> 'nome', 'em', v_lote.term ->> 'em', 'hash', v_lote.term ->> 'hash') end,
    'pecas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'card', k.id,
               'titulo', k.dados ->> 'tema',
               'volta', lc.volta,
               'versoes', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', v.id, 'n', v.n, 'titulo', v.titulo, 'fonte', v.fonte, 'url', v.url,
                          'driveId', v.drive_file_id, 'driveChave', v.drive_resource_key,
                          'duracaoMs', v.duracao_ms, 'fps', v.fps, 'largura', v.largura, 'altura', v.altura,
                          'miniatura', v.miniatura_url, 'em', v.criado_em,
                          'comentarios', maestro.link_comentarios_json(v_l.org_id, v.id)
                        ) order by v.n desc)
                   from (select * from maestro.versoes v2
                          where v2.org_id = v_l.org_id and v2.card_id = k.id and v2.apagado_em is null
                          order by v2.n desc limit 2) v
               ), '[]'::jsonb),
               'decisao', (
                 select jsonb_build_object('decisao', a.decision, 'nota', a.note, 'nome', a.approver_name, 'em', a.created_at, 'volta', a.volta, 'versao', a.versao_id)
                   from maestro.approvals a
                  where a.org_id = v_l.org_id and a.lote_id = v_l.lote_id and a.card_id = k.id
                  order by a.created_at desc limit 1
               )
             ) order by lc.posicao, k.id)
        from maestro.lote_cards lc
        join maestro.cards k on k.org_id = lc.org_id and k.id = lc.card_id
       where lc.lote_id = v_l.lote_id and lc.org_id = v_l.org_id and k.apagado_em is null
    ), '[]'::jsonb)
  ) into v_r
  from maestro.organizations o
  join maestro.clients c on c.id = v_l.client_id and c.org_id = o.id
  where o.id = v_l.org_id;
  return v_r;
end
$$;

-- O card faz parte do lote do link? (interna)
create or replace function maestro.link_card_no_lote(p_link maestro.approval_links, p_card text) returns integer
language sql stable security definer set search_path = '' as $$
  select lc.volta
    from maestro.lote_cards lc
    join maestro.cards k on k.org_id = lc.org_id and k.id = lc.card_id
   where lc.lote_id = p_link.lote_id and lc.org_id = p_link.org_id and lc.card_id = p_card and k.apagado_em is null
$$;

-- Comentário do cliente numa versão de uma peça do lote. Idempotente pela chave do aparelho.
create or replace function maestro.link_comentar(p_token_hash text, p_pin_ok boolean, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l maestro.approval_links;
  v_d jsonb := coalesce(p_dados, '{}'::jsonb);
  v_card text := v_d ->> 'card';
  v_versao maestro.versoes;
  v_c maestro.comentarios;
  v_idem text;
  v_texto text := btrim(coalesce(v_d ->> 'texto', ''));
begin
  v_l := maestro.link_vivo(p_token_hash);
  if v_l.id is null then
    return jsonb_build_object('erro', 'link');
  end if;
  if v_l.pin_hash is not null and p_pin_ok is distinct from true then
    return jsonb_build_object('erro', 'pin');
  end if;
  if maestro.link_card_no_lote(v_l, v_card) is null then
    return jsonb_build_object('erro', 'peca');
  end if;
  if (v_d ->> 'versao') !~ '^[0-9a-f-]{36}$' then
    return jsonb_build_object('erro', 'versao');
  end if;
  select * into v_versao from maestro.versoes v
   where v.org_id = v_l.org_id and v.card_id = v_card and v.id = (v_d ->> 'versao')::uuid and v.apagado_em is null;
  if not found then
    return jsonb_build_object('erro', 'versao');
  end if;
  if char_length(v_texto) not between 1 and 2000 then
    return jsonb_build_object('erro', 'texto');
  end if;
  if (v_d ->> 'pai') is not null then
    if (v_d ->> 'pai') !~ '^[0-9a-f-]{36}$' then
      return jsonb_build_object('erro', 'pai');
    end if;
    perform 1 from maestro.comentarios k where k.org_id = v_l.org_id and k.id = (v_d ->> 'pai')::uuid and k.versao_id = v_versao.id;
    if not found then
      return jsonb_build_object('erro', 'pai');
    end if;
  end if;
  v_idem := 'c:' || v_l.id::text || ':' || coalesce(v_d ->> 'idem', '');
  if char_length(coalesce(v_d ->> 'idem', '')) not between 8 and 64 then
    return jsonb_build_object('erro', 'idem');
  end if;
  select * into v_c from maestro.comentarios k where k.org_id = v_l.org_id and k.idem_key = v_idem;
  if not found then
    insert into maestro.comentarios (org_id, versao_id, card_id, pai_id, autor_tipo, link_id, autor_nome, t_ms, t_fim_ms, tempo_digitado, x, y, texto, idem_key)
    values (
      v_l.org_id, v_versao.id, v_card, (v_d ->> 'pai')::uuid, 'cliente', v_l.id,
      coalesce(nullif(left(btrim(regexp_replace(coalesce(v_d ->> 'nome', ''), '\s+', ' ', 'g')), 80), ''), 'Cliente'),
      (v_d ->> 't')::integer, (v_d ->> 'tFim')::integer, coalesce((v_d ->> 'digitado')::boolean, false),
      (v_d ->> 'x')::numeric, (v_d ->> 'y')::numeric, v_texto, v_idem
    )
    returning * into v_c;
    insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
      values (v_l.org_id, null, 'link.comentar', 'card', v_card, jsonb_build_object('link', v_l.id, 'versao', v_versao.n));
  end if;
  return jsonb_build_object('ok', true, 'comentario', jsonb_build_object(
    'id', v_c.id, 'pai', v_c.pai_id, 'autor', 'cliente', 'nome', v_c.autor_nome, 't', v_c.t_ms, 'tFim', v_c.t_fim_ms,
    'digitado', v_c.tempo_digitado, 'x', v_c.x, 'y', v_c.y, 'texto', v_c.texto, 'resolvido', v_c.resolvido_em is not null, 'em', v_c.criado_em));
end
$$;

-- "Revisar e enviar": as decisões das peças (aprovar ou pedir ajuste), o nome de quem decide e o aceite do termo, de uma
-- vez. Cada decisão vale uma vez por peça e volta (chave lote:card:volta): repetir devolve a que já está. Quem aprova
-- precisa decidir sobre a versão mais nova. A decisão nova move o card no Quadro (Aprovado, ou de volta a Revisão com
-- "ajuste pedido") e entra no histórico. O termo (nome, hora e o sha256 do que foi decidido) fica no lote.
create or replace function maestro.link_enviar(p_token_hash text, p_pin_ok boolean, p_envio jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l maestro.approval_links;
  v_e jsonb := coalesce(p_envio, '{}'::jsonb);
  v_nome text := left(btrim(regexp_replace(coalesce(v_e ->> 'nome', ''), '\s+', ' ', 'g')), 80);
  v_item jsonb;
  v_card text;
  v_decisao text;
  v_nota text;
  v_volta integer;
  v_ultima maestro.versoes;
  v_versao uuid;
  v_k maestro.cards;
  v_id uuid;
  v_alvo text;
  v_agora_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000);
  v_saida jsonb := '[]'::jsonb;
  v_canon text := '';
  v_hash text;
  v_campos jsonb;
begin
  v_l := maestro.link_vivo(p_token_hash);
  if v_l.id is null then
    return jsonb_build_object('erro', 'link');
  end if;
  if v_l.pin_hash is not null and p_pin_ok is distinct from true then
    return jsonb_build_object('erro', 'pin');
  end if;
  if char_length(v_nome) < 2 then
    return jsonb_build_object('erro', 'nome');
  end if;
  if (v_e ->> 'aceite') is distinct from 'true' then
    return jsonb_build_object('erro', 'aceite');
  end if;
  if jsonb_typeof(v_e -> 'decisoes') <> 'array' or jsonb_array_length(v_e -> 'decisoes') not between 1 and 100 then
    return jsonb_build_object('erro', 'decisoes');
  end if;

  for v_item in select value from jsonb_array_elements(v_e -> 'decisoes') loop
    v_card := v_item ->> 'card';
    v_decisao := v_item ->> 'decisao';
    v_nota := nullif(btrim(coalesce(v_item ->> 'nota', '')), '');
    if v_decisao not in ('aprovado', 'ajuste') or v_decisao is null then
      return jsonb_build_object('erro', 'decisao', 'card', v_card);
    end if;
    if v_nota is not null and char_length(v_nota) > 2000 then
      return jsonb_build_object('erro', 'nota', 'card', v_card);
    end if;
    v_volta := maestro.link_card_no_lote(v_l, v_card);
    if v_volta is null then
      return jsonb_build_object('erro', 'peca', 'card', v_card);
    end if;
    select * into v_ultima from maestro.versoes v
     where v.org_id = v_l.org_id and v.card_id = v_card and v.apagado_em is null order by v.n desc limit 1;
    v_versao := v_ultima.id;
    if v_versao is not null and (v_item ->> 'versao') is distinct from v_versao::text then
      return jsonb_build_object('erro', 'versao_nova', 'card', v_card);
    end if;
    -- Pedir ajuste precisa dizer o quê: uma nota ou um comentário do cliente na versão.
    if v_decisao = 'ajuste' and v_nota is null and not exists (
      select 1 from maestro.comentarios k where k.org_id = v_l.org_id and k.versao_id = v_versao and k.autor_tipo = 'cliente'
    ) then
      return jsonb_build_object('erro', 'ajuste_sem_nota', 'card', v_card);
    end if;

    select * into v_k from maestro.cards k where k.org_id = v_l.org_id and k.id = v_card for update;
    insert into maestro.approvals (org_id, card_id, card_version, lote_id, link_id, decision, note, approver_name, ip_hash, user_agent, consent_at, idempotency_key, versao_id, volta)
    values (
      v_l.org_id, v_card, v_k.versao, v_l.lote_id, v_l.id, v_decisao, v_nota, v_nome,
      case when (v_e ->> 'ip') ~ '^[0-9a-f]{64}$' then v_e ->> 'ip' end,
      left(v_e ->> 'ua', 300), now(),
      'lote:' || v_l.lote_id::text || ':' || v_card || ':' || v_volta::text, v_versao, v_volta
    )
    on conflict (idempotency_key) do nothing
    returning id into v_id;

    if v_id is null then
      select jsonb_build_object('card', v_card, 'decisao', a.decision, 'repetida', true) into v_item
        from maestro.approvals a where a.idempotency_key = 'lote:' || v_l.lote_id::text || ':' || v_card || ':' || v_volta::text;
      v_saida := v_saida || jsonb_build_array(v_item);
      continue;
    end if;

    v_canon := v_canon || v_card || '|' || coalesce(v_versao::text, '-') || '|' || v_volta::text || '|' || v_decisao || '|' || coalesce(v_nota, '') || E'\n';
    v_alvo := case v_decisao when 'aprovado' then 'aprovado' else 'revisao' end;
    if v_k.dados ->> 'coluna' in ('revisao', 'aprovacao') then
      v_campos := jsonb_build_object('coluna', jsonb_build_array(v_k.dados -> 'coluna', to_jsonb(v_alvo)), 'decisao', to_jsonb(v_decisao));
      update maestro.cards k
         set dados = case when v_decisao = 'ajuste'
                       then k.dados || jsonb_build_object('coluna', v_alvo, 'colunaEm', v_agora_ms, 'ajustePedido', true)
                       else (k.dados - 'ajustePedido') || jsonb_build_object('coluna', v_alvo, 'colunaEm', v_agora_ms) end,
             versoes = k.versoes
                       || jsonb_build_object('coluna', coalesce((k.versoes ->> 'coluna')::int, 0) + 1)
                       || jsonb_build_object('colunaEm', coalesce((k.versoes ->> 'colunaEm')::int, 0) + 1)
                       || jsonb_build_object('ajustePedido', coalesce((k.versoes ->> 'ajustePedido')::int, 0) + 1),
             versao = k.versao + 1,
             updated_at = now()
       where k.org_id = v_l.org_id and k.id = v_card;
    else
      v_campos := jsonb_build_object('decisao', to_jsonb(v_decisao));
    end if;
    insert into maestro.card_history (org_id, card_id, quem, operacao, campos)
      values (v_l.org_id, v_card, null, 'decisao', v_campos || jsonb_build_object('volta', v_volta, 'nome', v_nome));
    insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
      values (v_l.org_id, null, 'link.decidir', 'card', v_card, jsonb_build_object('link', v_l.id, 'decisao', v_decisao, 'volta', v_volta));
    v_saida := v_saida || jsonb_build_array(jsonb_build_object('card', v_card, 'decisao', v_decisao, 'repetida', false));
  end loop;

  if v_canon <> '' then
    v_hash := encode(sha256(convert_to(v_l.lote_id::text || E'\n' || v_nome || E'\n' || v_canon, 'UTF8')), 'hex');
    update maestro.lotes l
       set term = jsonb_build_object('nome', v_nome, 'em', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'hash', v_hash,
                                     'pecas', (select count(*) from jsonb_array_elements(v_saida) s where s ->> 'repetida' = 'false'),
                                     'envios', coalesce((l.term ->> 'envios')::int, 0) + 1)
     where l.id = v_l.lote_id;
  else
    select l.term ->> 'hash' into v_hash from maestro.lotes l where l.id = v_l.lote_id;
  end if;
  return jsonb_build_object('ok', true, 'decisoes', v_saida, 'termo', jsonb_build_object('nome', v_nome, 'hash', v_hash));
end
$$;

-- ───────────── privilégios ─────────────
revoke all on function
  maestro.comentario_guarda(),
  maestro.versao_criar(text, text, text, jsonb), maestro.versao_apagar(uuid),
  maestro.comentario_criar(uuid, jsonb), maestro.comentario_resolver(uuid, boolean),
  maestro.link_vivo(text), maestro.link_pin(text), maestro.link_comentarios_json(uuid, uuid), maestro.link_abrir(text, boolean),
  maestro.link_card_no_lote(maestro.approval_links, text), maestro.link_comentar(text, boolean, jsonb), maestro.link_enviar(text, boolean, jsonb)
from public;
grant execute on function
  maestro.versao_criar(text, text, text, jsonb), maestro.versao_apagar(uuid),
  maestro.comentario_criar(uuid, jsonb), maestro.comentario_resolver(uuid, boolean),
  maestro.link_pin(text), maestro.link_abrir(text, boolean), maestro.link_comentar(text, boolean, jsonb), maestro.link_enviar(text, boolean, jsonb)
to maestro_app;
;
insert into "maestro"."__drizzle_migrations" (hash, created_at) values ('dadc882949d0d0b7f50d72ff3d26172c1ccec9ced4e78609d17524df09f4434b', 1793577600000);

-- ===== 0006_orcamentos =====
set local search_path to "maestro", pg_catalog;
-- Maestro · 0006 · Tabela de preços e Orçamentos (plano v2 §6.1 e §6.3; porte de catalog_items/quotes/quote_items do ZRO).
-- Só acrescenta: nada das 0000–0004 é editado (a 0005 é da revisão/aprovações, feita em paralelo).
--
-- Regras desta e das próximas migrações da produtora (0006–0010):
--   * toda tabela tem org_id, RLS ligado e a política de organização da 0000 (linha da organização ativa E vínculo
--     ativo), em `using` e `with check`; os papéis entram como políticas restritivas (maestro.politicas_padrao);
--   * vínculo entre tabelas é por chave composta (org_id, id): não dá para apontar para a linha de outra organização
--     nem sabendo o id;
--   * dinheiro em centavos (bigint), datas de calendário em `date`;
--   * `demo` marca o que a demonstração criou ("Remover demonstração" apaga só isso).

-- ───────────── peças comuns ─────────────

-- Aplica o RLS padrão a uma tabela de negócio: organização ativa + papéis de escrita, remoção e (opcional) leitura.
-- Só o dono das migrações usa (nenhum privilégio para maestro_app).
create or replace function maestro.politicas_padrao(p_tabela text, p_escrita text[], p_remocao text[], p_leitura text[] default null)
returns void
language plpgsql set search_path = '' as $$
begin
  execute format('alter table maestro.%I enable row level security', p_tabela);
  execute format('drop policy if exists %I on maestro.%I', p_tabela || '_org', p_tabela);
  execute format(
    'create policy %I on maestro.%I for all to maestro_app using (org_id = maestro.current_org_id() and maestro.is_member(org_id)) with check (org_id = maestro.current_org_id() and maestro.is_member(org_id))',
    p_tabela || '_org', p_tabela);
  execute format('drop policy if exists %I on maestro.%I', p_tabela || '_leitura', p_tabela);
  if p_leitura is not null then
    execute format('create policy %I on maestro.%I as restrictive for select to maestro_app using (maestro.has_role(org_id, %L::text[]))',
      p_tabela || '_leitura', p_tabela, p_leitura);
  end if;
  execute format('drop policy if exists %I on maestro.%I', p_tabela || '_escrita', p_tabela);
  execute format('create policy %I on maestro.%I as restrictive for insert to maestro_app with check (maestro.has_role(org_id, %L::text[]))',
    p_tabela || '_escrita', p_tabela, p_escrita);
  execute format('drop policy if exists %I on maestro.%I', p_tabela || '_mudanca', p_tabela);
  execute format('create policy %I on maestro.%I as restrictive for update to maestro_app using (maestro.has_role(org_id, %L::text[])) with check (maestro.has_role(org_id, %L::text[]))',
    p_tabela || '_mudanca', p_tabela, p_escrita, p_escrita);
  execute format('drop policy if exists %I on maestro.%I', p_tabela || '_remocao', p_tabela);
  execute format('create policy %I on maestro.%I as restrictive for delete to maestro_app using (maestro.has_role(org_id, %L::text[]))',
    p_tabela || '_remocao', p_tabela, p_remocao);
  execute format('grant select, insert, update, delete on maestro.%I to maestro_app', p_tabela);
end
$$;
revoke all on function maestro.politicas_padrao(text, text[], text[], text[]) from public;

-- Clientes e projetos ganham a chave composta (org_id, id) para os vínculos das tabelas novas.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_org_id_uq' and conrelid = 'maestro.clients'::regclass) then
    alter table maestro.clients add constraint clients_org_id_uq unique (org_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_org_id_uq' and conrelid = 'maestro.projects'::regclass) then
    alter table maestro.projects add constraint projects_org_id_uq unique (org_id, id);
  end if;
end
$$;

-- ───────────── tabela de preços ─────────────

-- Item da tabela (o catalog_items do ZRO): grupo, unidade, preço e custo (o custo nunca sai no timbrado).
create table if not exists maestro.precos_itens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  grupo text not null default 'extra' check (grupo in ('pacote', 'captacao', 'pos', 'extra', 'logistica')),
  nome text not null check (char_length(nome) between 1 and 120),
  descricao text check (descricao is null or char_length(descricao) <= 500),
  unidade text not null default 'unidade' check (unidade in ('pacote', 'diaria', 'unidade', 'video', 'trecho', 'hora', 'km', 'projeto')),
  preco_cents bigint not null default 0 check (preco_cents between 0 and 100000000000),
  custo_cents bigint not null default 0 check (custo_cents between 0 and 100000000000),
  ativo boolean not null default true,
  ordem integer not null default 0,
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id)
);
create index if not exists precos_itens_org_idx on maestro.precos_itens (org_id, grupo, ordem);
create or replace trigger precos_itens_touch before update on maestro.precos_itens for each row execute function maestro.touch_updated_at();

-- Preço por quantidade: a partir de N unidades, cada uma sai por X (ex.: 1 vídeo R$ 900, 4 ou mais R$ 750 cada).
create table if not exists maestro.precos_faixas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  item_id uuid not null,
  a_partir_de numeric(12, 2) not null check (a_partir_de > 0 and a_partir_de <= 100000),
  preco_cents bigint not null check (preco_cents between 0 and 100000000000),
  foreign key (org_id, item_id) references maestro.precos_itens (org_id, id) on delete cascade,
  unique (item_id, a_partir_de)
);
create index if not exists precos_faixas_item_idx on maestro.precos_faixas (org_id, item_id);

-- Variáveis do orçamento (perguntas): `escolha` com multiplicador por opção (nicho, urgência, fora da base), ou
-- `numero` (quantidade de vídeos, diárias…) usada nas fórmulas dos modelos. opcoes: [{ valor, rotulo, mult, grupos? }].
create table if not exists maestro.precos_variaveis (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  chave text not null check (chave ~ '^[a-z][a-z0-9_]{0,39}$'),
  rotulo text not null check (char_length(rotulo) between 1 and 80),
  tipo text not null check (tipo in ('escolha', 'numero')),
  opcoes jsonb not null default '[]'::jsonb check (jsonb_typeof(opcoes) = 'array' and pg_column_size(opcoes) <= 16384),
  ordem integer not null default 0,
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, chave)
);

-- Modelos de orçamento (presets por nicho): linhas = [{ item_id, qtd: { fixo?, var?, mult?, soma?, min?, max? } }] e
-- respostas padrão. Fórmula estruturada, sem eval (src/lib/orcamento/motor.ts).
create table if not exists maestro.orcamento_modelos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 120),
  nicho text check (nicho is null or char_length(nicho) <= 60),
  descricao text check (descricao is null or char_length(descricao) <= 500),
  linhas jsonb not null default '[]'::jsonb check (jsonb_typeof(linhas) = 'array' and pg_column_size(linhas) <= 32768),
  respostas jsonb not null default '{}'::jsonb check (jsonb_typeof(respostas) = 'object'),
  ativo boolean not null default true,
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create or replace trigger orcamento_modelos_touch before update on maestro.orcamento_modelos for each row execute function maestro.touch_updated_at();

-- ───────────── orçamentos ─────────────

-- Número AAAA-NNN por organização e ano; cada revisão é uma versão nova do mesmo número (só uma aprovada por número).
create table if not exists maestro.orcamentos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  numero text not null check (numero ~ '^[0-9]{4}-[0-9]{3,5}$'),
  versao integer not null default 1 check (versao between 1 and 999),
  cliente_id uuid,
  projeto_id uuid,
  titulo text not null check (char_length(titulo) between 1 and 200),
  categoria text check (categoria is null or char_length(categoria) <= 80),
  status text not null default 'rascunho' check (status in ('rascunho', 'enviado', 'aprovado', 'recusado')),
  emissao date not null default current_date,
  validade date,
  periodo text check (periodo is null or char_length(periodo) <= 200),
  escopo text check (escopo is null or char_length(escopo) <= 8000),
  pagamento text check (pagamento is null or char_length(pagamento) <= 2000),
  condicoes text check (condicoes is null or char_length(condicoes) <= 4000),
  desconto_cents bigint not null default 0 check (desconto_cents between 0 and 100000000000),
  -- Imposto estimado (interno, só para a margem; não é o módulo de impostos do Financeiro).
  imposto_pct numeric(5, 2) not null default 0 check (imposto_pct between 0 and 100),
  notas_internas text check (notas_internas is null or char_length(notas_internas) <= 4000),
  -- Respostas do modelo (nicho, vídeos…) usadas para montar as linhas.
  respostas jsonb not null default '{}'::jsonb check (jsonb_typeof(respostas) = 'object'),
  -- Parcelas combinadas na aprovação: [{ rotulo, valor_cents, vencimento }].
  parcelas jsonb not null default '[]'::jsonb check (jsonb_typeof(parcelas) = 'array'),
  enviado_em timestamptz,
  decidido_em timestamptz,
  demo boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, numero, versao),
  foreign key (org_id, cliente_id) references maestro.clients (org_id, id) on delete set null (cliente_id),
  foreign key (org_id, projeto_id) references maestro.projects (org_id, id) on delete set null (projeto_id)
);
create unique index if not exists orcamentos_um_aprovado_uq on maestro.orcamentos (org_id, numero) where status = 'aprovado';
create index if not exists orcamentos_org_idx on maestro.orcamentos (org_id, status, emissao desc);
create index if not exists orcamentos_cliente_idx on maestro.orcamentos (org_id, cliente_id);
create or replace trigger orcamentos_touch before update on maestro.orcamentos for each row execute function maestro.touch_updated_at();

create table if not exists maestro.orcamento_itens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  orcamento_id uuid not null,
  preco_item_id uuid,
  descricao text not null check (char_length(descricao) between 1 and 200),
  detalhe text check (detalhe is null or char_length(detalhe) <= 500),
  quantidade numeric(12, 2) not null default 1 check (quantidade > 0 and quantidade <= 100000),
  unidade text check (unidade is null or char_length(unidade) <= 20),
  preco_cents bigint not null default 0 check (preco_cents between 0 and 100000000000),
  custo_cents bigint not null default 0 check (custo_cents between 0 and 100000000000),
  ordem integer not null default 0,
  foreign key (org_id, orcamento_id) references maestro.orcamentos (org_id, id) on delete cascade,
  foreign key (org_id, preco_item_id) references maestro.precos_itens (org_id, id) on delete set null (preco_item_id)
);
create index if not exists orcamento_itens_orc_idx on maestro.orcamento_itens (org_id, orcamento_id, ordem);

-- Preço da gasolina (ANP) por UF/município, renovado a cada 12 h. Só o sistema lê e escreve (sem org, sem dado pessoal).
create table if not exists maestro.cache_combustivel (
  chave text primary key check (char_length(chave) <= 120),
  dados jsonb not null,
  buscado_em timestamptz not null default now()
);
alter table maestro.cache_combustivel enable row level security;
revoke all on maestro.cache_combustivel from maestro_app;
drop policy if exists cache_combustivel_fechada on maestro.cache_combustivel;
create policy cache_combustivel_fechada on maestro.cache_combustivel for all to maestro_app using (false) with check (false);

-- ───────────── RLS e papéis ─────────────
-- Tabela de preços e modelos: todos leem; só administração e gestão mudam (é Ajustes).
-- Orçamentos: todos leem; admin, gestor e equipe escrevem; admin e gestor apagam.
select maestro.politicas_padrao('precos_itens', array['admin', 'gestor'], array['admin', 'gestor']);
select maestro.politicas_padrao('precos_faixas', array['admin', 'gestor'], array['admin', 'gestor']);
select maestro.politicas_padrao('precos_variaveis', array['admin', 'gestor'], array['admin', 'gestor']);
select maestro.politicas_padrao('orcamento_modelos', array['admin', 'gestor'], array['admin', 'gestor']);
select maestro.politicas_padrao('orcamentos', array['admin', 'gestor', 'equipe'], array['admin', 'gestor']);
select maestro.politicas_padrao('orcamento_itens', array['admin', 'gestor', 'equipe'], array['admin', 'gestor', 'equipe']);
;
insert into "maestro"."__drizzle_migrations" (hash, created_at) values ('07f717eebbc2593ddd00296afecabb9226be60e0ccf41fd62067296f923dd653', 1793664000000);

-- ===== 0007_freelas_agenda =====
set local search_path to "maestro", pg_catalog;
-- Maestro · 0007 · Banco de freelas, agenda e escala (plano v2 §7.2 e §7.3; porte de freelancers, freelancer_rates,
-- events, event_crew e project_crew do ZRO). Só acrescenta.
--
-- Dados de pagamento do freela (CPF/CNPJ e PIX) ficam numa tabela à parte, `freela_pagamento`, que só administração e
-- gestão leem ou escrevem (RLS em todos os comandos). Além disso, o conteúdo chega cifrado pela aplicação (AES-256-GCM
-- com MAESTRO_KEY, src/lib/freelas/pagamento.ts): o banco nunca vê o número em claro.

create table if not exists maestro.freelas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 120),
  cidade text check (cidade is null or char_length(cidade) <= 120),
  email text check (email is null or char_length(email) <= 254),
  whatsapp text check (whatsapp is null or whatsapp ~ '^[0-9]{8,15}$'),
  instagram text check (instagram is null or char_length(instagram) <= 60),
  funcoes text[] not null default '{}' check (cardinality(funcoes) <= 20),
  nichos text[] not null default '{}' check (cardinality(nichos) <= 20),
  whatsapp_msg text check (whatsapp_msg is null or char_length(whatsapp_msg) <= 500),
  notas text check (notas is null or char_length(notas) <= 4000),
  ativo boolean not null default true,
  -- Quando o freela tem conta Absolute ZRO (futuro: perfil pelo Carro do Freela, §7.4).
  zro_sub uuid,
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id)
);
create index if not exists freelas_org_idx on maestro.freelas (org_id, ativo, nome);
create or replace trigger freelas_touch before update on maestro.freelas for each row execute function maestro.touch_updated_at();

-- Valor padrão por função: por diária, por projeto ou por vídeo.
create table if not exists maestro.freela_valores (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  freela_id uuid not null,
  funcao text not null check (char_length(funcao) between 1 and 40),
  unidade text not null default 'diaria' check (unidade in ('diaria', 'projeto', 'video')),
  valor_cents bigint not null check (valor_cents between 0 and 100000000000),
  foreign key (org_id, freela_id) references maestro.freelas (org_id, id) on delete cascade,
  unique (freela_id, funcao, unidade)
);

-- CPF/CNPJ e PIX: separados, cifrados e só para administração e gestão.
create table if not exists maestro.freela_pagamento (
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  freela_id uuid not null,
  documento_enc text check (documento_enc is null or documento_enc like 'v1.%'),
  pix_enc text check (pix_enc is null or pix_enc like 'v1.%'),
  pix_tipo text check (pix_tipo is null or pix_tipo in ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria')),
  titular text check (titular is null or char_length(titular) <= 120),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (org_id, freela_id),
  foreign key (org_id, freela_id) references maestro.freelas (org_id, id) on delete cascade
);
create or replace trigger freela_pagamento_touch before update on maestro.freela_pagamento for each row execute function maestro.touch_updated_at();

-- Agenda: diárias, entregas, reuniões e compromissos (porte de events). Datas de calendário; hora opcional.
create table if not exists maestro.eventos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  projeto_id uuid,
  tipo text not null default 'diaria' check (tipo in ('diaria', 'entrega', 'reuniao', 'outro')),
  titulo text not null check (char_length(titulo) between 1 and 200),
  data date not null,
  data_fim date check (data_fim is null or data_fim >= data),
  hora_ini time,
  hora_fim time,
  local text check (local is null or char_length(local) <= 300),
  notas text check (notas is null or char_length(notas) <= 4000),
  cor text check (cor is null or cor in ('vermelho', 'laranja', 'amarelo', 'verde', 'azul', 'roxo', 'rosa')),
  demo boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, projeto_id) references maestro.projects (org_id, id) on delete set null (projeto_id)
);
create index if not exists eventos_org_data_idx on maestro.eventos (org_id, data);
create or replace trigger eventos_touch before update on maestro.eventos for each row execute function maestro.touch_updated_at();

-- Escala: quem trabalha em qual projeto (e diária), em que função, por quantos dias e por quanto. É a equipe do
-- projeto do ZRO (project_crew) e o event_crew juntos: escalar numa diária = linha com evento_id.
create table if not exists maestro.escalas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  projeto_id uuid,
  evento_id uuid,
  freela_id uuid not null,
  funcao text not null check (char_length(funcao) between 1 and 40),
  inicio date not null,
  fim date not null check (fim >= inicio),
  dias integer not null default 1 check (dias between 0 and 366),
  diaria_cents bigint check (diaria_cents is null or diaria_cents between 0 and 100000000000),
  valor_cents bigint not null default 0 check (valor_cents between 0 and 100000000000),
  origem text not null default 'manual' check (origem in ('manual', 'agenda')),
  notas text check (notas is null or char_length(notas) <= 1000),
  demo boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, projeto_id) references maestro.projects (org_id, id) on delete cascade,
  foreign key (org_id, evento_id) references maestro.eventos (org_id, id) on delete cascade,
  foreign key (org_id, freela_id) references maestro.freelas (org_id, id) on delete cascade
);
create index if not exists escalas_org_freela_idx on maestro.escalas (org_id, freela_id, inicio);
create index if not exists escalas_org_projeto_idx on maestro.escalas (org_id, projeto_id);
create index if not exists escalas_org_evento_idx on maestro.escalas (org_id, evento_id);
create unique index if not exists escalas_evento_freela_uq on maestro.escalas (evento_id, freela_id) where evento_id is not null;
create or replace trigger escalas_touch before update on maestro.escalas for each row execute function maestro.touch_updated_at();

-- ───────────── RLS e papéis ─────────────
-- Banco de freelas, agenda e escala: todos leem; admin, gestor e equipe escrevem; admin e gestor apagam freela.
select maestro.politicas_padrao('freelas', array['admin', 'gestor', 'equipe'], array['admin', 'gestor']);
select maestro.politicas_padrao('freela_valores', array['admin', 'gestor', 'equipe'], array['admin', 'gestor', 'equipe']);
select maestro.politicas_padrao('eventos', array['admin', 'gestor', 'equipe'], array['admin', 'gestor', 'equipe']);
select maestro.politicas_padrao('escalas', array['admin', 'gestor', 'equipe'], array['admin', 'gestor', 'equipe']);
-- Dados de pagamento: só administração e gestão, inclusive para ler.
select maestro.politicas_padrao('freela_pagamento', array['admin', 'gestor'], array['admin', 'gestor'], array['admin', 'gestor']);
;
insert into "maestro"."__drizzle_migrations" (hash, created_at) values ('64deb3f3a670e7010871826869a01cd961b0bbb4ff36c1cec4dc135b340695e7', 1793750400000);
reset role;

select 'ok: 02c-novo-maestro-1.sql feito. Siga para o próximo arquivo.' as resultado;
