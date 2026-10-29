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
