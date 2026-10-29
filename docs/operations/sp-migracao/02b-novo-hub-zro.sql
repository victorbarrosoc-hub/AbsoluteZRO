-- Absolute ZRO · mudança do banco para São Paulo · passo 2b: HUB (schema zro), 24 migrations
-- RODE NO PROJETO: AbsoluteZRO-SP (São Paulo, ref njvhgycmbuhimxovxuqj)  <-- o NOVO. Nunca no AbsoluteZRO antigo.
-- Gerado das migrations do repositório (origin/main). Não edite à mão.
-- Roda inteiro de uma vez: se der erro, nada fica pela metade (o bloco volta atrás sozinho).
do $guarda$ begin if not exists (select 1 from pg_roles where rolname = 'maestro_app') then raise exception 'PARE: rode antes o passo 2a (ou você está no projeto errado).'; end if; end $guarda$;
do $guarda$ begin if exists (select 1 from pg_namespace where nspname = 'zro') then raise exception 'PARE: o schema zro já existe aqui. O passo 2b já foi feito, ou este é o projeto antigo.'; end if; end $guarda$;
set local search_path to "$user", public, extensions;
create schema if not exists zro;
create table if not exists zro.schema_migrations (
      name text primary key, checksum text not null, applied_at timestamptz not null default now());

-- ===== 0001_foundation.sql =====
-- Absolute ZRO HUB · 0001 · fundação do banco NOVO (PRD §5.1, §7).
-- Roda apenas no banco do HUB. Nunca aponte esta migration para o banco de um produto original.
--
-- Papéis:
--   dono das tabelas  = usuário que roda as migrations (no Supabase novo: postgres). Usado só pelo código de
--                       sistema (worker, webhooks, autenticação), sempre por packages/db `asSystem`.
--   zro_app           = papel sem login que o servidor assume (SET LOCAL ROLE) em toda operação de usuário.
--                       Não é dono nem tem BYPASSRLS: as políticas de 0002 valem sempre.
-- Contexto por transação (packages/db `asUser`): zro.user_id e zro.org_id via set_config(..., true).

create schema if not exists zro;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'zro_app') then
    create role zro_app nologin;
  end if;
end
$$;
grant zro_app to current_user;

revoke all on schema zro from public;
grant usage on schema zro to zro_app;

-- No Supabase, os papéis da Data API não enxergam nada do HUB: tudo passa pelo servidor.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on schema zro from %I', r);
    end if;
  end loop;
end
$$;

-- ───────────── contexto ─────────────

create or replace function zro.current_user_id() returns uuid
language sql stable set search_path = '' as $$
  select nullif(current_setting('zro.user_id', true), '')::uuid
$$;

create or replace function zro.current_org_id() returns uuid
language sql stable set search_path = '' as $$
  select nullif(current_setting('zro.org_id', true), '')::uuid
$$;

create or replace function zro.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- ───────────── identidade (§5.1) ─────────────

create table if not exists zro.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(btrim(email)) and position('@' in email) > 1),
  email_verified_at timestamptz,
  display_name text not null default '' check (char_length(display_name) <= 120),
  status text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  -- Papel de plataforma (console de administração). Nunca vem do cliente.
  platform_role text check (platform_role in ('support', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create or replace trigger users_touch before update on zro.users for each row execute function zro.touch_updated_at();

-- Senha separada da identidade: zro_app não lê esta tabela.
create table if not exists zro.auth_credentials (
  user_id uuid primary key references zro.users (id) on delete cascade,
  password_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists zro.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references zro.users (id) on delete cascade,
  token_hash text not null unique,
  active_org_id uuid,
  user_agent text,
  ip_hash text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index if not exists sessions_user_idx on zro.sessions (user_id) where revoked_at is null;

-- Tokens de uso único (verificar e-mail, redefinir senha). Só o hash fica guardado.
create table if not exists zro.auth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references zro.users (id) on delete cascade,
  purpose text not null check (purpose in ('verify_email', 'reset_password')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists zro.rate_limit_attempts (
  key text not null,
  at timestamptz not null default now()
);
create index if not exists rate_limit_key_idx on zro.rate_limit_attempts (key, at);

-- ───────────── organizações (§5.1, §9.2 caso E) ─────────────

create table if not exists zro.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$'),
  kind text not null default 'team' check (kind in ('person', 'team', 'company')),
  owner_id uuid not null references zro.users (id),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create or replace trigger organizations_touch before update on zro.organizations for each row execute function zro.touch_updated_at();

alter table zro.sessions drop constraint if exists sessions_active_org_fk;
alter table zro.sessions add constraint sessions_active_org_fk foreign key (active_org_id) references zro.organizations (id) on delete set null;

create table if not exists zro.memberships (
  org_id uuid not null references zro.organizations (id) on delete cascade,
  user_id uuid not null references zro.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'manager', 'editor', 'viewer', 'billing')),
  status text not null default 'active' check (status in ('active', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists memberships_user_idx on zro.memberships (user_id) where status = 'active';
create or replace trigger memberships_touch before update on zro.memberships for each row execute function zro.touch_updated_at();

-- A organização nunca fica sem dono ativo.
create or replace function zro.keep_an_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := coalesce(old.org_id, new.org_id);
begin
  if not exists (select 1 from zro.organizations o where o.id = v_org) then
    return null; -- organização apagada em cascata
  end if;
  if not exists (select 1 from zro.memberships m where m.org_id = v_org and m.role = 'owner' and m.status = 'active') then
    raise exception 'A organização precisa de pelo menos um dono ativo.' using errcode = '23514';
  end if;
  return null;
end
$$;
drop trigger if exists memberships_keep_owner on zro.memberships;
create constraint trigger memberships_keep_owner after update or delete on zro.memberships
  deferrable initially deferred for each row execute function zro.keep_an_owner();

create table if not exists zro.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references zro.organizations (id) on delete cascade,
  email text not null check (email = lower(btrim(email))),
  role text not null check (role in ('admin', 'manager', 'editor', 'viewer', 'billing')),
  token_hash text not null unique,
  invited_by uuid not null references zro.users (id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references zro.users (id),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists invitations_org_idx on zro.invitations (org_id);

-- ───────────── catálogo, planos e assinaturas (§4.3, §9) ─────────────

create table if not exists zro.products (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  name text not null,
  stage text not null check (stage in ('active', 'beta', 'coming_soon', 'disabled')),
  step_order int not null unique,
  role_in_flow text not null,
  description text not null default '',
  -- Como o HUB fala com o produto (PRD §6.2): external_link, api_adapter, module, scaffold.
  integration_mode text not null check (integration_mode in ('external_link', 'api_adapter', 'module', 'scaffold')),
  external_url text,
  provisional_name boolean not null default false,
  updated_at timestamptz not null default now()
);
create or replace trigger products_touch before update on zro.products for each row execute function zro.touch_updated_at();

create table if not exists zro.product_features (
  product_id text not null references zro.products (id) on delete cascade,
  feature_key text not null check (feature_key ~ '^[a-z0-9_.-]+$'),
  description text not null default '',
  -- Operação medida: consome quota da métrica abaixo; sem limite configurado ela fica bloqueada.
  metric text,
  primary key (product_id, feature_key)
);

-- Catálogo versionado: um plano publicado não muda; uma mudança vira nova versão.
create table if not exists zro.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[a-z0-9-]+$'),
  version int not null check (version > 0),
  name text not null,
  kind text not null check (kind in ('free', 'individual', 'bundle', 'team')),
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  -- Preço, periodicidade, teste grátis e carência: nada é presumido (PRD §9.1). null = a definir.
  price_cents int check (price_cents >= 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  billing_interval text check (billing_interval in ('month', 'year')),
  trial_days int check (trial_days >= 0),
  grace_days int not null default 0 check (grace_days between 0 and 60),
  description text not null default '',
  created_at timestamptz not null default now(),
  unique (code, version)
);

create table if not exists zro.plan_products (
  plan_id uuid not null references zro.plans (id) on delete cascade,
  product_id text not null references zro.products (id),
  -- null = todas as features do produto; lista = só essas.
  features text[],
  -- Limites por métrica: {"synquei.organization_plans": 50}. Métrica ausente = sem limite configurado.
  limits jsonb not null default '{}'::jsonb check (jsonb_typeof(limits) = 'object'),
  primary key (plan_id, product_id)
);

create table if not exists zro.subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references zro.organizations (id) on delete cascade,
  plan_id uuid not null references zro.plans (id),
  status text not null check (status in ('incomplete', 'trialing', 'active', 'past_due', 'canceled', 'expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  grace_until timestamptz,
  provider text not null check (provider ~ '^[a-z0-9_-]+$'),
  provider_subscription_id text,
  provider_customer_id text,
  -- Ordem dos eventos do provedor: um evento mais velho nunca desfaz um mais novo.
  provider_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);
create index if not exists subscriptions_org_idx on zro.subscriptions (org_id);
create or replace trigger subscriptions_touch before update on zro.subscriptions for each row execute function zro.touch_updated_at();

create table if not exists zro.entitlements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references zro.organizations (id) on delete cascade,
  product_id text not null references zro.products (id),
  features text[],
  limits jsonb not null default '{}'::jsonb,
  source text not null check (source in ('subscription', 'trial', 'admin_grant')),
  source_id uuid,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  status text not null default 'active' check (status in ('active', 'revoked')),
  reason text,
  created_by uuid references zro.users (id),
  created_at timestamptz not null default now()
);
create index if not exists entitlements_org_product_idx on zro.entitlements (org_id, product_id) where status = 'active';

create table if not exists zro.quotas (
  org_id uuid not null references zro.organizations (id) on delete cascade,
  metric text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  limit_value bigint check (limit_value >= 0),
  used bigint not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (org_id, metric, period_start)
);

create table if not exists zro.usage_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references zro.organizations (id) on delete cascade,
  user_id uuid references zro.users (id),
  metric text not null,
  amount bigint not null check (amount > 0),
  idempotency_key text not null,
  project_id uuid,
  workflow_run_id uuid,
  period_start timestamptz not null,
  created_at timestamptz not null default now(),
  unique (org_id, idempotency_key)
);

create table if not exists zro.billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  type text not null,
  occurred_at timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  org_id uuid references zro.organizations (id) on delete set null,
  payload jsonb not null,
  error text,
  unique (provider, provider_event_id)
);

-- ───────────── projetos (§4.2, §7.1) ─────────────

create table if not exists zro.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references zro.organizations (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  type text not null default 'outro',
  client_reference text,
  status text not null default 'active' check (status in ('active', 'paused', 'delivered', 'archived')),
  visibility text not null default 'organization' check (visibility in ('organization', 'restricted')),
  origin text not null default 'hub',
  brief jsonb not null default '{}'::jsonb,
  delivery_targets jsonb not null default '[]'::jsonb,
  external_links jsonb not null default '[]'::jsonb,
  workflow_version int not null default 1,
  created_by uuid not null references zro.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_org_idx on zro.projects (org_id, updated_at desc);
create or replace trigger projects_touch before update on zro.projects for each row execute function zro.touch_updated_at();

create table if not exists zro.project_members (
  project_id uuid not null references zro.projects (id) on delete cascade,
  user_id uuid not null references zro.users (id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  added_by uuid references zro.users (id),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- Estado real de cada etapa do Ciclo do O por projeto (§4.2).
create table if not exists zro.project_steps (
  project_id uuid not null references zro.projects (id) on delete cascade,
  org_id uuid not null references zro.organizations (id) on delete cascade,
  step_key text not null references zro.products (id),
  state text not null default 'not_started' check (state in (
    'not_started', 'waiting_material', 'ready', 'processing', 'needs_review', 'done', 'failed', 'blocked_subscription', 'unavailable')),
  source text,
  last_synced_at timestamptz,
  detail jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (project_id, step_key)
);
create or replace trigger project_steps_touch before update on zro.project_steps for each row execute function zro.touch_updated_at();

-- Briefing e roteiro versionados: cada gravação é uma versão nova.
create table if not exists zro.project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references zro.projects (id) on delete cascade,
  org_id uuid not null references zro.organizations (id) on delete cascade,
  kind text not null check (kind in ('brief', 'script')),
  version int not null check (version > 0),
  title text not null default '',
  body text not null default '',
  source text not null default 'hub',
  external_ref text,
  created_by uuid references zro.users (id),
  created_at timestamptz not null default now(),
  unique (project_id, kind, version)
);

-- ───────────── mídia: manifests, ativos e localizações (§7.2) ─────────────

create table if not exists zro.media_manifests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references zro.organizations (id) on delete cascade,
  project_id uuid not null references zro.projects (id) on delete cascade,
  manifest_id text not null,
  schema_version text not null,
  source_app text not null,
  job_id text,
  status text not null check (status in ('valid', 'valid_with_warnings', 'invalid')),
  verification jsonb not null default '{}'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  payload jsonb not null,
  imported_by uuid references zro.users (id),
  created_at timestamptz not null default now(),
  unique (org_id, manifest_id)
);

create table if not exists zro.project_assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references zro.organizations (id) on delete cascade,
  project_id uuid not null references zro.projects (id) on delete cascade,
  -- ID estável do ativo entre etapas (gerado pelo adaptador a partir da origem); nunca reaproveitado.
  asset_key text not null,
  manifest_row_id uuid references zro.media_manifests (id) on delete set null,
  original_name text not null,
  relative_path text not null,
  size_bytes bigint check (size_bytes >= 0),
  mime text,
  media jsonb not null default '{}'::jsonb,
  camera text,
  card text,
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (project_id, asset_key)
);

create table if not exists zro.asset_locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references zro.organizations (id) on delete cascade,
  asset_id uuid not null references zro.project_assets (id) on delete cascade,
  -- URI lógico (zro-dest://<destino>/<caminho>), nunca URL pública com segredo.
  uri text not null check (uri !~* '^https?://'),
  destination_label text not null,
  -- verified = há checksum conferido deste destino; unverified = listado pela origem, sem prova de conferência.
  status text not null check (status in ('unverified', 'verified', 'mismatch', 'missing', 'failed')),
  verified_at timestamptz,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (asset_id, uri)
);

create table if not exists zro.asset_checksums (
  asset_id uuid not null references zro.project_assets (id) on delete cascade,
  org_id uuid not null references zro.organizations (id) on delete cascade,
  algorithm text not null check (algorithm in ('xxh64', 'md5', 'sha256')),
  value text not null check (value ~ '^[0-9a-f]+$'),
  location_id uuid references zro.asset_locations (id) on delete cascade,
  source text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists asset_checksums_uniq on zro.asset_checksums (asset_id, algorithm, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- IDs externos por adaptador (§7.1, §12): nunca senha, hash ou token do original.
create table if not exists zro.integration_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references zro.organizations (id) on delete cascade,
  product_id text not null references zro.products (id),
  external_type text not null,
  external_id text not null,
  internal_type text not null,
  internal_id uuid not null,
  created_by uuid references zro.users (id),
  created_at timestamptz not null default now(),
  unique (org_id, product_id, external_type, external_id)
);

-- ───────────── eventos e execuções (§7.3) ─────────────

create table if not exists zro.workflow_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references zro.organizations (id) on delete cascade,
  project_id uuid references zro.projects (id) on delete cascade,
  event_type text not null,
  schema_version int not null,
  producer text not null,
  occurred_at timestamptz not null,
  correlation_id uuid not null,
  causation_id uuid,
  idempotency_key text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (org_id, idempotency_key)
);
create index if not exists workflow_events_project_idx on zro.workflow_events (project_id, created_at desc);

create table if not exists zro.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references zro.organizations (id) on delete cascade,
  project_id uuid references zro.projects (id) on delete cascade,
  event_id uuid not null references zro.workflow_events (id) on delete cascade,
  handler text not null,
  product_id text references zro.products (id),
  status text not null default 'queued' check (status in (
    'queued', 'running', 'succeeded', 'failed', 'dead_letter', 'requires_review', 'blocked', 'canceled')),
  attempts int not null default 0,
  max_attempts int not null default 5 check (max_attempts between 1 and 20),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  result jsonb,
  reprocess_of uuid references zro.workflow_runs (id),
  created_by uuid references zro.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, handler, reprocess_of)
);
create unique index if not exists workflow_runs_first_uniq on zro.workflow_runs (event_id, handler) where reprocess_of is null;
create index if not exists workflow_runs_queue_idx on zro.workflow_runs (next_attempt_at) where status = 'queued';
create index if not exists workflow_runs_project_idx on zro.workflow_runs (project_id, created_at desc);
create or replace trigger workflow_runs_touch before update on zro.workflow_runs for each row execute function zro.touch_updated_at();

-- ───────────── auditoria (§5.2, §9.3) ─────────────

create table if not exists zro.audit_logs (
  id bigint generated always as identity primary key,
  org_id uuid references zro.organizations (id) on delete set null,
  actor_user_id uuid references zro.users (id) on delete set null,
  actor_kind text not null default 'user' check (actor_kind in ('user', 'system', 'provider', 'admin')),
  action text not null,
  target_type text,
  target_id text,
  ip_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_org_idx on zro.audit_logs (org_id, created_at desc);

-- Auditoria só cresce: nem o dono das tabelas edita ou apaga linhas pela aplicação. A única mudança aceita é a
-- referência virar null quando a organização ou o usuário deixam de existir (on delete set null).
create or replace function zro.audit_is_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE'
     and (new.org_id is not distinct from old.org_id or new.org_id is null)
     and (new.actor_user_id is not distinct from old.actor_user_id or new.actor_user_id is null)
     and new.action = old.action and new.actor_kind = old.actor_kind
     and new.target_type is not distinct from old.target_type and new.target_id is not distinct from old.target_id
     and new.metadata = old.metadata and new.created_at = old.created_at then
    return new;
  end if;
  raise exception 'audit_logs é somente inclusão.' using errcode = '42501';
end
$$;
drop trigger if exists audit_logs_append_only on zro.audit_logs;
create trigger audit_logs_append_only before update or delete on zro.audit_logs
  for each row execute function zro.audit_is_append_only();
;
insert into zro.schema_migrations (name, checksum) values ('0001_foundation.sql', '66c1c0a811054ecc530af0e186a20c995f0cdfd9da8ce5bd60fc7f885f6940fc');

-- ===== 0002_rls.sql =====
-- Absolute ZRO HUB · 0002 · RLS e privilégios do papel zro_app (PRD §5.2).
-- Regra geral: o servidor conecta como dono, abre a transação, assume zro_app e informa usuário e organização
-- ativa. Tudo que é de organização exige org_id = organização ativa E vínculo ativo do usuário com ela, então
-- trocar a organização ativa nunca mostra dados de outra (caso E). Testes: packages/db/test/rls.test.ts.

-- ───────────── funções de checagem (security definer: leem vínculos sem recursão de RLS) ─────────────

create or replace function zro.member_role(p_org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role
  from zro.memberships m
  join zro.organizations o on o.id = m.org_id
  join zro.users u on u.id = m.user_id
  where m.org_id = p_org and m.user_id = zro.current_user_id()
    and m.status = 'active' and o.status = 'active' and u.status = 'active'
$$;

create or replace function zro.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select zro.member_role(p_org) is not null
$$;

create or replace function zro.has_org_role(p_org uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(zro.member_role(p_org) = any (p_roles), false)
$$;

create or replace function zro.is_project_member(p_project uuid, p_roles text[] default array['editor', 'viewer']) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from zro.project_members pm
    where pm.project_id = p_project and pm.user_id = zro.current_user_id() and pm.role = any (p_roles)
  )
$$;

create or replace function zro.can_view_project(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from zro.projects p
    where p.id = p_project and p.org_id = zro.current_org_id() and (
      zro.has_org_role(p.org_id, array['owner', 'admin', 'manager'])
      or (p.visibility = 'organization' and zro.has_org_role(p.org_id, array['editor', 'viewer']))
      or (zro.is_member(p.org_id) and zro.is_project_member(p.id))
    )
  )
$$;

create or replace function zro.can_edit_project(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from zro.projects p
    where p.id = p_project and p.org_id = zro.current_org_id() and p.status <> 'archived' and (
      zro.has_org_role(p.org_id, array['owner', 'admin', 'manager'])
      or (p.visibility = 'organization' and zro.has_org_role(p.org_id, array['editor']))
      or (zro.is_member(p.org_id) and zro.is_project_member(p.id, array['editor']))
    )
  )
$$;

create or replace function zro.shares_org_with(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from zro.memberships a
    join zro.memberships b on b.org_id = a.org_id
    where a.user_id = zro.current_user_id() and b.user_id = p_user and a.status = 'active' and b.status = 'active'
      and a.org_id = zro.current_org_id()
  )
$$;

-- Criar organização: a pessoa vira dona na mesma transação.
create or replace function zro.create_organization(p_name text, p_slug text, p_kind text default 'team') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := zro.current_user_id();
  v_org uuid;
begin
  if v_user is null or not exists (select 1 from zro.users u where u.id = v_user and u.status = 'active') then
    raise exception 'Entre na sua conta para criar uma organização.' using errcode = '28000';
  end if;
  insert into zro.organizations (name, slug, kind, owner_id) values (btrim(p_name), p_slug, p_kind, v_user) returning id into v_org;
  insert into zro.memberships (org_id, user_id, role) values (v_org, v_user, 'owner');
  insert into zro.audit_logs (org_id, actor_user_id, action, target_type, target_id)
    values (v_org, v_user, 'organization.created', 'organization', v_org::text);
  return v_org;
end
$$;

revoke all on all functions in schema zro from public;
grant execute on function
  zro.current_user_id(), zro.current_org_id(), zro.member_role(uuid), zro.is_member(uuid),
  zro.has_org_role(uuid, text[]), zro.is_project_member(uuid, text[]), zro.can_view_project(uuid),
  zro.can_edit_project(uuid), zro.shares_org_with(uuid), zro.create_organization(text, text, text)
to zro_app;

-- ───────────── RLS em todas as tabelas ─────────────

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'zro' and tablename <> 'schema_migrations' loop
    execute format('alter table zro.%I enable row level security', t);
  end loop;
end
$$;

-- Sem privilégio nenhum para zro_app: senha, tokens, tentativas e eventos de cobrança.
revoke all on zro.auth_credentials, zro.auth_tokens, zro.rate_limit_attempts, zro.billing_events from zro_app;

-- users
grant select on zro.users to zro_app;
grant update (display_name) on zro.users to zro_app;
drop policy if exists users_select on zro.users;
create policy users_select on zro.users for select to zro_app
  using (id = zro.current_user_id() or zro.shares_org_with(id));
drop policy if exists users_update_self on zro.users;
create policy users_update_self on zro.users for update to zro_app
  using (id = zro.current_user_id()) with check (id = zro.current_user_id());

-- sessions: a pessoa vê as próprias sessões (sem o hash do token).
grant select (id, user_id, active_org_id, user_agent, created_at, last_used_at, expires_at, revoked_at) on zro.sessions to zro_app;
drop policy if exists sessions_select_own on zro.sessions;
create policy sessions_select_own on zro.sessions for select to zro_app using (user_id = zro.current_user_id());

-- organizations
grant select on zro.organizations to zro_app;
grant update (name) on zro.organizations to zro_app;
drop policy if exists organizations_select on zro.organizations;
create policy organizations_select on zro.organizations for select to zro_app using (zro.is_member(id));
drop policy if exists organizations_update on zro.organizations;
create policy organizations_update on zro.organizations for update to zro_app
  using (id = zro.current_org_id() and zro.has_org_role(id, array['owner', 'admin']))
  with check (id = zro.current_org_id());

-- memberships
grant select on zro.memberships to zro_app;
grant update (role, status) on zro.memberships to zro_app;
drop policy if exists memberships_select on zro.memberships;
create policy memberships_select on zro.memberships for select to zro_app
  using (user_id = zro.current_user_id() or (org_id = zro.current_org_id() and zro.is_member(org_id)));
drop policy if exists memberships_update on zro.memberships;
create policy memberships_update on zro.memberships for update to zro_app
  using (org_id = zro.current_org_id() and zro.has_org_role(org_id, array['owner', 'admin'])
         and (role <> 'owner' or zro.has_org_role(org_id, array['owner'])))
  with check (org_id = zro.current_org_id() and (role <> 'owner' or zro.has_org_role(org_id, array['owner'])));

-- invitations
grant select, insert on zro.invitations to zro_app;
grant update (revoked_at) on zro.invitations to zro_app;
drop policy if exists invitations_select on zro.invitations;
create policy invitations_select on zro.invitations for select to zro_app
  using (org_id = zro.current_org_id() and zro.has_org_role(org_id, array['owner', 'admin']));
drop policy if exists invitations_insert on zro.invitations;
create policy invitations_insert on zro.invitations for insert to zro_app
  with check (org_id = zro.current_org_id() and zro.has_org_role(org_id, array['owner', 'admin'])
              and invited_by = zro.current_user_id());
drop policy if exists invitations_revoke on zro.invitations;
create policy invitations_revoke on zro.invitations for update to zro_app
  using (org_id = zro.current_org_id() and zro.has_org_role(org_id, array['owner', 'admin']))
  with check (org_id = zro.current_org_id());

-- catálogo: leitura para qualquer sessão; rascunho de plano não aparece.
grant select on zro.products, zro.product_features, zro.plans, zro.plan_products to zro_app;
drop policy if exists products_select on zro.products;
create policy products_select on zro.products for select to zro_app using (true);
drop policy if exists product_features_select on zro.product_features;
create policy product_features_select on zro.product_features for select to zro_app using (true);
drop policy if exists plans_select on zro.plans;
create policy plans_select on zro.plans for select to zro_app using (status in ('active', 'retired'));
drop policy if exists plan_products_select on zro.plan_products;
create policy plan_products_select on zro.plan_products for select to zro_app
  using (exists (select 1 from zro.plans p where p.id = plan_id and p.status in ('active', 'retired')));

-- assinatura e consumo: escrita só pelo sistema (webhook assinado ou console de administração).
grant select on zro.subscriptions, zro.entitlements, zro.quotas, zro.usage_events to zro_app;
drop policy if exists subscriptions_select on zro.subscriptions;
create policy subscriptions_select on zro.subscriptions for select to zro_app
  using (org_id = zro.current_org_id() and zro.has_org_role(org_id, array['owner', 'admin', 'billing']));
drop policy if exists entitlements_select on zro.entitlements;
create policy entitlements_select on zro.entitlements for select to zro_app
  using (org_id = zro.current_org_id() and zro.is_member(org_id));
drop policy if exists quotas_select on zro.quotas;
create policy quotas_select on zro.quotas for select to zro_app
  using (org_id = zro.current_org_id() and zro.is_member(org_id));
drop policy if exists usage_events_select on zro.usage_events;
create policy usage_events_select on zro.usage_events for select to zro_app
  using (org_id = zro.current_org_id() and zro.has_org_role(org_id, array['owner', 'admin', 'manager', 'billing']));

-- projects
grant select, insert on zro.projects to zro_app;
grant update (title, type, client_reference, status, visibility, brief, delivery_targets, external_links) on zro.projects to zro_app;
drop policy if exists projects_select on zro.projects;
create policy projects_select on zro.projects for select to zro_app
  using (org_id = zro.current_org_id() and (
    zro.has_org_role(org_id, array['owner', 'admin', 'manager'])
    or (visibility = 'organization' and zro.has_org_role(org_id, array['editor', 'viewer']))
    or (zro.is_member(org_id) and zro.is_project_member(id))
  ));
drop policy if exists projects_insert on zro.projects;
create policy projects_insert on zro.projects for insert to zro_app
  with check (org_id = zro.current_org_id() and created_by = zro.current_user_id()
              and zro.has_org_role(org_id, array['owner', 'admin', 'manager', 'editor']));
drop policy if exists projects_update on zro.projects;
create policy projects_update on zro.projects for update to zro_app
  using (zro.can_edit_project(id) or (org_id = zro.current_org_id() and zro.has_org_role(org_id, array['owner', 'admin', 'manager'])))
  with check (org_id = zro.current_org_id());

-- project_members
grant select, insert, delete on zro.project_members to zro_app;
drop policy if exists project_members_select on zro.project_members;
create policy project_members_select on zro.project_members for select to zro_app using (zro.can_view_project(project_id));
drop policy if exists project_members_insert on zro.project_members;
create policy project_members_insert on zro.project_members for insert to zro_app
  with check (exists (select 1 from zro.projects p where p.id = project_id and p.org_id = zro.current_org_id()
                      and zro.has_org_role(p.org_id, array['owner', 'admin', 'manager'])));
drop policy if exists project_members_delete on zro.project_members;
create policy project_members_delete on zro.project_members for delete to zro_app
  using (exists (select 1 from zro.projects p where p.id = project_id and p.org_id = zro.current_org_id()
                 and zro.has_org_role(p.org_id, array['owner', 'admin', 'manager'])));

-- Tabelas filhas de projeto: ver = ver o projeto; gravar = editar o projeto.
do $$
declare t text;
begin
  foreach t in array array['project_steps', 'project_documents', 'media_manifests', 'project_assets'] loop
    execute format('grant select, insert on zro.%I to zro_app', t);
    execute format('drop policy if exists %I on zro.%I', t || '_select', t);
    execute format('create policy %I on zro.%I for select to zro_app using (org_id = zro.current_org_id() and zro.can_view_project(project_id))', t || '_select', t);
    execute format('drop policy if exists %I on zro.%I', t || '_insert', t);
    execute format('create policy %I on zro.%I for insert to zro_app with check (org_id = zro.current_org_id() and zro.can_edit_project(project_id))', t || '_insert', t);
  end loop;
end
$$;
grant update (state, source, last_synced_at, detail) on zro.project_steps to zro_app;
drop policy if exists project_steps_update on zro.project_steps;
create policy project_steps_update on zro.project_steps for update to zro_app
  using (org_id = zro.current_org_id() and zro.can_edit_project(project_id))
  with check (org_id = zro.current_org_id());

-- Localizações e checksums: pelo projeto do ativo.
do $$
declare t text;
begin
  foreach t in array array['asset_locations', 'asset_checksums'] loop
    execute format('grant select, insert on zro.%I to zro_app', t);
    execute format('drop policy if exists %I on zro.%I', t || '_select', t);
    execute format('create policy %I on zro.%I for select to zro_app using (org_id = zro.current_org_id() and exists (select 1 from zro.project_assets a where a.id = asset_id and zro.can_view_project(a.project_id)))', t || '_select', t);
    execute format('drop policy if exists %I on zro.%I', t || '_insert', t);
    execute format('create policy %I on zro.%I for insert to zro_app with check (org_id = zro.current_org_id() and exists (select 1 from zro.project_assets a where a.id = asset_id and a.org_id = zro.current_org_id() and zro.can_edit_project(a.project_id)))', t || '_insert', t);
  end loop;
end
$$;

-- integration_links
grant select, insert on zro.integration_links to zro_app;
drop policy if exists integration_links_select on zro.integration_links;
create policy integration_links_select on zro.integration_links for select to zro_app
  using (org_id = zro.current_org_id() and zro.is_member(org_id));
drop policy if exists integration_links_insert on zro.integration_links;
create policy integration_links_insert on zro.integration_links for insert to zro_app
  with check (org_id = zro.current_org_id() and created_by = zro.current_user_id()
              and zro.has_org_role(org_id, array['owner', 'admin', 'manager', 'editor']));

-- eventos e execuções: o usuário publica e acompanha; quem muda o estado da execução é o worker (sistema).
grant select, insert on zro.workflow_events, zro.workflow_runs to zro_app;
do $$
declare t text;
begin
  foreach t in array array['workflow_events', 'workflow_runs'] loop
    execute format('drop policy if exists %I on zro.%I', t || '_select', t);
    execute format('create policy %I on zro.%I for select to zro_app using (org_id = zro.current_org_id() and zro.is_member(org_id) and (project_id is null or zro.can_view_project(project_id)))', t || '_select', t);
    execute format('drop policy if exists %I on zro.%I', t || '_insert', t);
    execute format('create policy %I on zro.%I for insert to zro_app with check (org_id = zro.current_org_id() and zro.has_org_role(org_id, array[''owner'', ''admin'', ''manager'', ''editor'']) and (project_id is null or zro.can_edit_project(project_id)))', t || '_insert', t);
  end loop;
end
$$;

-- audit_logs: dono/admin veem a organização; cada um vê o que fez. Inclusão só em nome próprio.
grant select, insert on zro.audit_logs to zro_app;
drop policy if exists audit_logs_select on zro.audit_logs;
create policy audit_logs_select on zro.audit_logs for select to zro_app
  using (actor_user_id = zro.current_user_id()
         or (org_id = zro.current_org_id() and zro.has_org_role(org_id, array['owner', 'admin'])));
drop policy if exists audit_logs_insert on zro.audit_logs;
create policy audit_logs_insert on zro.audit_logs for insert to zro_app
  with check (actor_user_id = zro.current_user_id() and actor_kind = 'user'
              and (org_id is null or (org_id = zro.current_org_id() and zro.is_member(org_id))));
;
insert into zro.schema_migrations (name, checksum) values ('0002_rls.sql', 'afee3feb470a2c1958608f855bc8724d5b48c0ba5227c8fd6d041350c74fd829');

-- ===== 0003_catalog.sql =====
-- Absolute ZRO HUB · 0003 · catálogo inicial NEUTRO (PRD §9.1).
-- Sem preço, teste grátis, periodicidade ou "ilimitado": tudo isso fica null até o titular definir no console.
-- Limites de operações medidas também começam vazios; operação medida sem limite configurado fica bloqueada.
-- Idempotente: reexecutar não sobrescreve o que o console já mudou.

insert into zro.products (id, name, stage, step_order, role_in_flow, description, integration_mode, external_url, provisional_name) values
  ('carro-do-freela', 'Carro do Freela', 'beta', 1, 'Comunidade, oportunidades e contratação',
   'Agenda e contratação de freelas do audiovisual. Hoje é um protótipo com partes simuladas; o HUB recebe o job pelo contrato job.created.',
   'external_link', 'https://carrodofreela.com.br', false),
  ('tpeasy', 'TPeasy', 'active', 2, 'Roteiro e suporte à captação',
   'Teleprompter no celular. O HUB guarda o roteiro versionado e troca roteiros com o TPeasy pelo backup JSON do próprio app.',
   'external_link', 'https://tpeasy.vercel.app', false),
  ('sobedesce', 'SOBEDESCE', 'active', 3, 'Ingest, cópia e backup em mídia física e nuvem',
   'Cópia conferida por checksum para discos e Google Drive. O HUB importa o resumo de cada cartão e o relatório xxHash64.',
   'api_adapter', 'https://sobedesce.vercel.app', false),
  ('synquei', 'Synquei', 'active', 4, 'Organização, alinhamento e sincronização',
   'Sincronia pelo som e exportação para o editor. O HUB valida o manifest e propõe a organização sem mover nada.',
   'api_adapter', 'https://synquei.vercel.app', false),
  ('ai-edit', 'AI Edit', 'coming_soon', 5, 'Decupagem, seleção e montagem assistida',
   'Em desenvolvimento. Ainda não processa nada; os contratos de entrada e saída estão definidos.',
   'scaffold', null, true),
  ('nossom', 'NOSSOM', 'active', 6, 'Tratamento sonoro e SFX',
   'Estúdio de áudio. O áudio fica no dispositivo; o HUB só passa a timeline e as marcações pelo contrato edit.timeline.ready.',
   'external_link', 'https://nossom-teal.vercel.app', false),
  ('finishing', 'Finishing', 'coming_soon', 7, 'Media manager, color grading assistido e entregas',
   'Em desenvolvimento. Começa por QC, exportação e media manager; grading assistido vem depois.',
   'scaffold', null, true)
on conflict (id) do nothing;

insert into zro.product_features (product_id, feature_key, description, metric) values
  ('carro-do-freela', 'job_import', 'Criar projeto a partir de um job (contrato job.created)', null),
  ('tpeasy', 'script_import', 'Importar roteiro do backup do TPeasy como nova versão', null),
  ('tpeasy', 'script_export', 'Exportar o roteiro do projeto no formato de backup do TPeasy', null),
  ('sobedesce', 'manifest_import', 'Importar o resumo do cartão e o relatório de checksums', 'sobedesce.manifest_imports'),
  ('synquei', 'organization_plan', 'Validar o manifest e propor a organização (prévia, sem mover arquivos)', 'synquei.organization_plans'),
  ('nossom', 'timeline_handoff', 'Preparar a passagem de timeline e marcações para o NOSSOM', null)
on conflict (product_id, feature_key) do nothing;

-- Planos v1, ativos e sem preço. Futuras ferramentas só entram no Ciclo do O em nova versão, depois de lançadas.
insert into zro.plans (code, version, name, kind, status, description) values
  ('conta-absolute-zro', 1, 'Conta Absolute ZRO', 'free', 'active', 'Identidade, painel, organização e catálogo.'),
  ('ciclo-do-o', 1, 'Ciclo do O', 'bundle', 'active', 'Acesso às ferramentas lançadas incluídas na oferta ativa, com limites explícitos.'),
  ('individual-carro-do-freela', 1, 'Carro do Freela', 'individual', 'active', 'Somente Carro do Freela.'),
  ('individual-tpeasy', 1, 'TPeasy', 'individual', 'active', 'Somente TPeasy.'),
  ('individual-sobedesce', 1, 'SOBEDESCE', 'individual', 'active', 'Somente SOBEDESCE.'),
  ('individual-synquei', 1, 'Synquei', 'individual', 'active', 'Somente Synquei.'),
  ('individual-nossom', 1, 'NOSSOM', 'individual', 'active', 'Somente NOSSOM.')
on conflict (code, version) do nothing;

insert into zro.plan_products (plan_id, product_id)
select p.id, x.product_id
from zro.plans p
join (values
  ('ciclo-do-o', 'carro-do-freela'), ('ciclo-do-o', 'tpeasy'), ('ciclo-do-o', 'sobedesce'),
  ('ciclo-do-o', 'synquei'), ('ciclo-do-o', 'nossom'),
  ('individual-carro-do-freela', 'carro-do-freela'), ('individual-tpeasy', 'tpeasy'),
  ('individual-sobedesce', 'sobedesce'), ('individual-synquei', 'synquei'), ('individual-nossom', 'nossom')
) as x (code, product_id) on x.code = p.code
where p.version = 1
on conflict (plan_id, product_id) do nothing;
;
insert into zro.schema_migrations (name, checksum) values ('0003_catalog.sql', 'f60655cf2520daad70f1043adfbfab776d56e72915513f220143811512891316');

-- ===== 0004_oidc.sql =====
-- Absolute ZRO HUB · 0004 · login único (OpenID Connect) para os apps da família (ADR 0012).
-- O HUB é o provedor: cada app é um cliente cadastrado no console. Códigos e refresh tokens guardam só o sha256.
-- Nada aqui é lido pelo papel zro_app, exceto o que a pessoa vê em "Apps com acesso" (consentimentos e nome do app).

create table if not exists zro.oauth_clients (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  product_id text references zro.products (id),
  -- confidential = servidor que guarda segredo (site do app); public = app sem segredo (desktop/celular), só com PKCE.
  kind text not null check (kind in ('confidential', 'public')),
  secret_hash text,
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 20),
  -- Apps de desktop: aceita http://127.0.0.1:<qualquer porta>/caminho cadastrado (RFC 8252 §7.3).
  allow_loopback boolean not null default false,
  scopes text[] not null default array['openid', 'email', 'profile', 'org', 'offline_access'],
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_by uuid references zro.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'confidential') = (secret_hash is not null))
);
create or replace trigger oauth_clients_touch before update on zro.oauth_clients for each row execute function zro.touch_updated_at();

create table if not exists zro.oauth_consents (
  user_id uuid not null references zro.users (id) on delete cascade,
  client_id text not null references zro.oauth_clients (id) on delete cascade,
  scopes text[] not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, client_id)
);

create table if not exists zro.oauth_codes (
  code_hash text primary key,
  client_id text not null references zro.oauth_clients (id) on delete cascade,
  user_id uuid not null references zro.users (id) on delete cascade,
  org_id uuid references zro.organizations (id) on delete set null,
  redirect_uri text not null,
  scopes text[] not null,
  code_challenge text not null,
  nonce text,
  auth_time timestamptz not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists oauth_codes_expires_idx on zro.oauth_codes (expires_at);

-- Rotação: cada uso troca o refresh token; reapresentar um já usado revoga a família inteira (roubo provável).
create table if not exists zro.oauth_refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  family_id uuid not null,
  client_id text not null references zro.oauth_clients (id) on delete cascade,
  user_id uuid not null references zro.users (id) on delete cascade,
  org_id uuid references zro.organizations (id) on delete set null,
  scopes text[] not null,
  auth_time timestamptz not null,
  family_started_at timestamptz not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists oauth_refresh_family_idx on zro.oauth_refresh_tokens (family_id);
create index if not exists oauth_refresh_user_client_idx on zro.oauth_refresh_tokens (user_id, client_id) where revoked_at is null;

alter table zro.oauth_clients enable row level security;
alter table zro.oauth_consents enable row level security;
alter table zro.oauth_codes enable row level security;
alter table zro.oauth_refresh_tokens enable row level security;

revoke all on zro.oauth_clients, zro.oauth_consents, zro.oauth_codes, zro.oauth_refresh_tokens from zro_app;

-- "Apps com acesso" no Perfil: a pessoa vê os próprios consentimentos e o nome do app (nunca segredo nem URIs).
grant select (id, name, product_id, status) on zro.oauth_clients to zro_app;
drop policy if exists oauth_clients_select on zro.oauth_clients;
create policy oauth_clients_select on zro.oauth_clients for select to zro_app using (true);
grant select on zro.oauth_consents to zro_app;
drop policy if exists oauth_consents_select_own on zro.oauth_consents;
create policy oauth_consents_select_own on zro.oauth_consents for select to zro_app using (user_id = zro.current_user_id());

-- Chave de assinatura (ES256). Gerada pelo HUB no primeiro uso, só o sistema lê; ZRO_OIDC_SIGNING_KEY tem prioridade.
-- Rotação: marcar a atual como 'retired' (o JWKS segue publicando-a até os tokens dela expirarem) e deixar gerar outra.
create table if not exists zro.oidc_keys (
  kid text primary key,
  private_pem text not null,
  status text not null default 'active' check (status in ('active', 'retired')),
  created_at timestamptz not null default now()
);
create unique index if not exists oidc_keys_one_active on zro.oidc_keys ((status)) where status = 'active';
alter table zro.oidc_keys enable row level security;
revoke all on zro.oidc_keys from zro_app;
;
insert into zro.schema_migrations (name, checksum) values ('0004_oidc.sql', '544c10fffab06d2f1780a746b00dbfac9d6126a73fbdd028a16369c5bf2a753e');

-- ===== 0005_family_apps.sql =====
-- Absolute ZRO HUB · 0005 · apps da família entram direto, como numa central de apps (ADR 0012, adendo).
-- trusted: app da própria Absolute ZRO. O HUB registra o consentimento sozinho e não mostra a tela "Permitir".
--   O acesso continua aparecendo em Perfil › Apps com acesso e pode ser removido; só o console marca um app como confiável.
-- sso_start_url: endereço do app que já começa o "Entrar com Absolute ZRO". O botão Abrir do HUB usa este endereço,
--   então quem está logado no HUB chega ao app já logado. Vazio = Abrir usa external_url, como antes.

alter table zro.oauth_clients add column if not exists trusted boolean not null default false;

alter table zro.products add column if not exists sso_start_url text;
alter table zro.products drop constraint if exists products_sso_start_url_https;
alter table zro.products add constraint products_sso_start_url_https check (sso_start_url is null or sso_start_url ~ '^https://[^\s]+$');
;
insert into zro.schema_migrations (name, checksum) values ('0005_family_apps.sql', '82793256779418a8611a976bec67bda6e1cdb7f7f232c773e22b86d50a22fc43');

-- ===== 0006_app_accounts.sql =====
-- Absolute ZRO HUB · 0006 · a conta de cada pessoa em cada app da família.
-- Pedido do titular (25/10/2026): contas novas nas plataformas nascem da conta Absolute ZRO. O HUB registra aqui o
-- primeiro e o último acesso a cada app (no momento em que emite o código do login único). Para apps sem banco
-- próprio (Synquei, TPeasy), este registro é a conta do app.
create table if not exists zro.app_accounts (
  user_id uuid not null references zro.users (id) on delete cascade,
  client_id text not null references zro.oauth_clients (id) on delete cascade,
  product_id text references zro.products (id),
  first_login_at timestamptz not null default now(),
  last_login_at timestamptz not null default now(),
  logins integer not null default 1 check (logins >= 1),
  primary key (user_id, client_id)
);
create index if not exists app_accounts_client_idx on zro.app_accounts (client_id, first_login_at desc);
alter table zro.app_accounts enable row level security;
revoke all on zro.app_accounts from zro_app;
grant select on zro.app_accounts to zro_app;
drop policy if exists app_accounts_select_own on zro.app_accounts;
create policy app_accounts_select_own on zro.app_accounts for select to zro_app using (user_id = zro.current_user_id());

-- Quem já entrou num app antes desta migration: o consentimento registrado vira a conta.
insert into zro.app_accounts (user_id, client_id, product_id, first_login_at, last_login_at)
select c.user_id, c.client_id, cl.product_id, c.granted_at, c.granted_at
from zro.oauth_consents c join zro.oauth_clients cl on cl.id = c.client_id
on conflict (user_id, client_id) do nothing;
;
insert into zro.schema_migrations (name, checksum) values ('0006_app_accounts.sql', '8dc10eccb4e4817fc72bee620d90bc15e6547e732c6782cd4bd95959be9b9cb2');

-- ===== 0007_free_plan_on_signup.sql =====
-- Absolute ZRO HUB · 0007 · toda organização nova começa no plano grátis (pedido do titular em 25/10/2026).
-- A conta nasce na Absolute ZRO; o que ela pode usar nos apps vem do admin: o plano grátis "conta-absolute-zro"
-- (a versão ativa mais nova) define as ferramentas de quem acabou de chegar, e o console concede ou retira o resto.
-- A v2 inclui as ferramentas lançadas, para os apps continuarem abertos a quem já usava. Mudar o padrão = nova
-- versão do plano no console; quem já tem a assinatura fica na versão que recebeu.

insert into zro.plans (code, version, name, kind, status, description) values
  ('conta-absolute-zro', 2, 'Conta Absolute ZRO', 'free', 'active', 'Identidade, painel e as ferramentas liberadas para toda conta nova.')
on conflict (code, version) do nothing;

insert into zro.plan_products (plan_id, product_id)
select p.id, x.product_id
from zro.plans p
join (values ('carro-do-freela'), ('tpeasy'), ('sobedesce'), ('synquei'), ('nossom')) as x (product_id) on true
where p.code = 'conta-absolute-zro' and p.version = 2
on conflict (plan_id, product_id) do nothing;

update zro.plans set status = 'retired' where code = 'conta-absolute-zro' and version = 1 and status = 'active';

-- Assina o plano grátis vigente e cria os entitlements dele (mesma regra de recomputeEntitlements: só ferramentas
-- lançadas). Idempotente: organização que já tem qualquer assinatura não recebe outra.
create or replace function zro.start_free_plan(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_plan uuid;
  v_sub uuid;
begin
  if exists (select 1 from zro.subscriptions s where s.org_id = p_org) then
    return;
  end if;
  select p.id into v_plan from zro.plans p
  where p.code = 'conta-absolute-zro' and p.kind = 'free' and p.status = 'active'
  order by p.version desc limit 1;
  if v_plan is null then
    return;
  end if;
  insert into zro.subscriptions (org_id, plan_id, status, current_period_start, provider, provider_subscription_id, provider_updated_at)
    values (p_org, v_plan, 'active', now(), 'free', 'free-' || p_org::text, now())
    returning id into v_sub;
  insert into zro.entitlements (org_id, product_id, features, limits, source, source_id, starts_at)
    select p_org, pp.product_id, pp.features, pp.limits, 'subscription', v_sub, now()
    from zro.plan_products pp join zro.products pr on pr.id = pp.product_id
    where pp.plan_id = v_plan and pr.stage in ('active', 'beta');
end
$$;
revoke all on function zro.start_free_plan(uuid) from public;

create or replace function zro.create_organization(p_name text, p_slug text, p_kind text default 'team') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := zro.current_user_id();
  v_org uuid;
begin
  if v_user is null or not exists (select 1 from zro.users u where u.id = v_user and u.status = 'active') then
    raise exception 'Entre na sua conta para criar uma organização.' using errcode = '28000';
  end if;
  insert into zro.organizations (name, slug, kind, owner_id) values (btrim(p_name), p_slug, p_kind, v_user) returning id into v_org;
  insert into zro.memberships (org_id, user_id, role) values (v_org, v_user, 'owner');
  insert into zro.audit_logs (org_id, actor_user_id, action, target_type, target_id)
    values (v_org, v_user, 'organization.created', 'organization', v_org::text);
  perform zro.start_free_plan(v_org);
  return v_org;
end
$$;

-- Organizações que já existiam e nunca tiveram assinatura entram no plano grátis agora.
select zro.start_free_plan(o.id) from zro.organizations o
where o.status = 'active' and not exists (select 1 from zro.subscriptions s where s.org_id = o.id);
;
insert into zro.schema_migrations (name, checksum) values ('0007_free_plan_on_signup.sql', 'c8de77611f9aaf33767d12214b300690f3baeb611c331fde512c42cbb34e85e8');

-- ===== 0008_external_identities.sql =====
-- Absolute ZRO HUB · 0008 · "Entrar com o Google" (pedido do titular em 25/10/2026).
-- O Google é só uma porta para a conta Absolute ZRO: a identidade externa fica ligada a um zro.users, nunca vira
-- uma conta separada. Mesmo e-mail confirmado pelo Google = mesma conta (mescla). Os apps continuam recebendo a
-- conta Absolute ZRO pelo login único; nenhum token do Google é guardado.

create table if not exists zro.external_identities (
  provider text not null check (provider in ('google')),
  subject text not null check (char_length(subject) between 1 and 255),
  user_id uuid not null references zro.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  last_login_at timestamptz not null default now(),
  primary key (provider, subject)
);
create index if not exists external_identities_user_idx on zro.external_identities (user_id);

alter table zro.external_identities enable row level security;
revoke all on zro.external_identities from zro_app;
grant select on zro.external_identities to zro_app;
drop policy if exists external_identities_select_own on zro.external_identities;
create policy external_identities_select_own on zro.external_identities for select to zro_app using (user_id = zro.current_user_id());
;
insert into zro.schema_migrations (name, checksum) values ('0008_external_identities.sql', 'd73c4118ecdd93e665d5b9db092b3afca4ab3c8ef64f7e6b4faed571f7cfe81d');

-- ===== 0009_revela.sql =====
-- Absolute ZRO HUB · 0009 · a plataforma de finalização e cor ganha nome: Revela (ADR 0015, decisão do titular).
-- O id técnico continua 'finishing' (contratos finishing.qc.completed e delivery.ready, planos e acessos já usam).
-- Só troca o que ainda está como a 0003 deixou: se o console já mudou nome ou descrição, fica o do console.

update zro.products
   set name = 'Revela', provisional_name = false
 where id = 'finishing' and name = 'Finishing';

update zro.products
   set role_in_flow = 'Gestão de cor, color grading e entregas para o DaVinci Resolve',
       description = 'Em desenvolvimento. Começa pela cor no DaVinci Resolve: LUT criativa a partir de um frame de referência, LUTs por câmera e entrega em PowerGrade e LUT.'
 where id = 'finishing' and description = 'Em desenvolvimento. Começa por QC, exportação e media manager; grading assistido vem depois.';
;
insert into zro.schema_migrations (name, checksum) values ('0009_revela.sql', 'e9f4900472701655fac9c3a218041bdb0664d87807fea80108258115a8884287');

-- ===== 0010_account_center.sql =====
-- Absolute ZRO HUB · 0010 · central da conta (pedido do titular em 26/10/2026).
-- Foto do perfil, troca de e-mail confirmada pelo endereço novo e pedidos de renovação/upgrade de plano. Sem provedor
-- de pagamento, o pedido não libera nada: a equipe atende pelo console e o acesso continua vindo da assinatura.

-- Foto do perfil: imagem pequena (o navegador já reduz para 256 px) guardada no próprio banco.
create table if not exists zro.user_avatars (
  user_id uuid primary key references zro.users (id) on delete cascade,
  content_type text not null check (content_type in ('image/webp', 'image/jpeg', 'image/png')),
  data bytea not null check (octet_length(data) between 1 and 300000),
  updated_at timestamptz not null default now()
);
alter table zro.user_avatars enable row level security;
revoke all on zro.user_avatars from zro_app;
grant select, insert, update, delete on zro.user_avatars to zro_app;
drop policy if exists user_avatars_select on zro.user_avatars;
create policy user_avatars_select on zro.user_avatars for select to zro_app
  using (user_id = zro.current_user_id() or zro.shares_org_with(user_id));
drop policy if exists user_avatars_write_own on zro.user_avatars;
create policy user_avatars_write_own on zro.user_avatars for all to zro_app
  using (user_id = zro.current_user_id()) with check (user_id = zro.current_user_id());

-- Troca de e-mail: token de uso único mandado ao endereço novo, que só vale depois de confirmado.
alter table zro.auth_tokens add column if not exists new_email text
  check (new_email is null or (new_email = lower(btrim(new_email)) and position('@' in new_email) > 1));
alter table zro.auth_tokens drop constraint if exists auth_tokens_purpose_check;
alter table zro.auth_tokens add constraint auth_tokens_purpose_check
  check (purpose in ('verify_email', 'reset_password', 'change_email'));
alter table zro.auth_tokens drop constraint if exists auth_tokens_change_email_target;
alter table zro.auth_tokens add constraint auth_tokens_change_email_target check ((purpose = 'change_email') = (new_email is not null));

-- Pedidos de plano: quem cuida da cobrança pede renovação ou upgrade; a equipe atende no console.
create table if not exists zro.plan_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references zro.organizations (id) on delete cascade,
  requested_by uuid not null references zro.users (id) on delete cascade,
  kind text not null check (kind in ('renew', 'upgrade')),
  plan_id uuid references zro.plans (id),
  status text not null default 'open' check (status in ('open', 'done', 'canceled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references zro.users (id),
  check ((kind = 'upgrade') = (plan_id is not null))
);
create unique index if not exists plan_requests_one_open on zro.plan_requests (org_id, kind, coalesce(plan_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'open';
create index if not exists plan_requests_open_idx on zro.plan_requests (created_at desc) where status = 'open';
alter table zro.plan_requests enable row level security;
revoke all on zro.plan_requests from zro_app;
grant select, insert on zro.plan_requests to zro_app;
grant update (status) on zro.plan_requests to zro_app;
drop policy if exists plan_requests_select on zro.plan_requests;
create policy plan_requests_select on zro.plan_requests for select to zro_app
  using (org_id = zro.current_org_id() and zro.has_org_role(org_id, array['owner', 'admin', 'billing']));
drop policy if exists plan_requests_insert on zro.plan_requests;
create policy plan_requests_insert on zro.plan_requests for insert to zro_app
  with check (org_id = zro.current_org_id() and requested_by = zro.current_user_id() and status = 'open'
    and zro.has_org_role(org_id, array['owner', 'admin', 'billing']));
-- Quem pediu (ou outro responsável pela cobrança) pode desistir de um pedido aberto; atender é só no console.
drop policy if exists plan_requests_cancel on zro.plan_requests;
create policy plan_requests_cancel on zro.plan_requests for update to zro_app
  using (org_id = zro.current_org_id() and status = 'open' and zro.has_org_role(org_id, array['owner', 'admin', 'billing']))
  with check (status = 'canceled');
;
insert into zro.schema_migrations (name, checksum) values ('0010_account_center.sql', '9182f19b436235ab364e7ddb88c30ca8aa46864c1776738452a0bbbbfd10a296');

-- ===== 0011_vendas.sql =====
-- Vendas (decisão do titular em 26/10/2026): Stripe, mensal ou anual (anual: avulso R$ 449, Completo e Pro 10× o mensal), 7 dias de teste do
-- Completo para conta nova, contas atuais seguem liberadas até uma data de corte. Tabela "Premium enxuto":
--   Avulso (1 app) R$ 59,90/mês ou R$ 449/ano · Completo R$ 149,90/mês ou R$ 1.499/ano · Pro R$ 299,90/mês ou R$ 2.999/ano.
-- Uso comum é livre; IA e GPU gastam créditos do mês (métrica zro.ai_credits): avulso 200, Completo 600, Pro 2.000,
-- teste 50. Nada muda para ninguém até a administração ligar as vendas no console (launchSales).

insert into zro.plans (code, version, name, kind, status, price_cents, currency, billing_interval, trial_days, grace_days, description) values
  ('ciclo-do-o', 2, 'Absolute ZRO Completo', 'bundle', 'active', 14990, 'BRL', 'month', 0, 3, 'Todas as ferramentas lançadas.'),
  ('ciclo-do-o-anual', 1, 'Absolute ZRO Completo', 'bundle', 'active', 149900, 'BRL', 'year', 0, 3, 'Todas as ferramentas lançadas, por um ano.'),
  ('absolute-zro-pro', 1, 'Absolute ZRO Pro', 'bundle', 'active', 29990, 'BRL', 'month', 0, 3, 'Todas as ferramentas, com mais créditos de IA e GPU.'),
  ('absolute-zro-pro-anual', 1, 'Absolute ZRO Pro', 'bundle', 'active', 299900, 'BRL', 'year', 0, 3, 'Todas as ferramentas, com mais créditos de IA e GPU, por um ano.'),
  ('individual-carro-do-freela', 2, 'Carro do Freela', 'individual', 'active', 5990, 'BRL', 'month', 0, 3, 'Somente Carro do Freela.'),
  ('individual-carro-do-freela-anual', 1, 'Carro do Freela', 'individual', 'active', 44900, 'BRL', 'year', 0, 3, 'Somente Carro do Freela, por um ano.'),
  ('individual-tpeasy', 2, 'TPeasy', 'individual', 'active', 5990, 'BRL', 'month', 0, 3, 'Somente TPeasy.'),
  ('individual-tpeasy-anual', 1, 'TPeasy', 'individual', 'active', 44900, 'BRL', 'year', 0, 3, 'Somente TPeasy, por um ano.'),
  ('individual-sobedesce', 2, 'SOBEDESCE', 'individual', 'active', 5990, 'BRL', 'month', 0, 3, 'Somente SOBEDESCE.'),
  ('individual-sobedesce-anual', 1, 'SOBEDESCE', 'individual', 'active', 44900, 'BRL', 'year', 0, 3, 'Somente SOBEDESCE, por um ano.'),
  ('individual-synquei', 2, 'Synquei', 'individual', 'active', 5990, 'BRL', 'month', 0, 3, 'Somente Synquei.'),
  ('individual-synquei-anual', 1, 'Synquei', 'individual', 'active', 44900, 'BRL', 'year', 0, 3, 'Somente Synquei, por um ano.'),
  ('individual-nossom', 2, 'NOSSOM', 'individual', 'active', 5990, 'BRL', 'month', 0, 3, 'Somente NOSSOM.'),
  ('individual-nossom-anual', 1, 'NOSSOM', 'individual', 'active', 44900, 'BRL', 'year', 0, 3, 'Somente NOSSOM, por um ano.'),
  -- Conta grátis depois das vendas: identidade, painel e catálogo, sem ferramentas. Entra no ar com launchSales.
  ('conta-absolute-zro', 3, 'Conta Absolute ZRO', 'free', 'draft', null, null, null, null, 0, 'Identidade, painel e catálogo.')
on conflict (code, version) do nothing;

-- Mesmas ferramentas da versão anterior; o Pro leva as do Completo. Limites por plano: créditos de IA e GPU e as
-- operações medidas do HUB (importar manifesto do SOBEDESCE, planos de organização do Synquei).
insert into zro.plan_products (plan_id, product_id, features, limits)
select n.id, pp.product_id, pp.features,
       pp.limits || case
         when n.code like 'absolute-zro-pro%' then '{"zro.ai_credits": 2000, "sobedesce.manifest_imports": 2000, "synquei.organization_plans": 2000}'::jsonb
         when n.code like 'ciclo-do-o%' then '{"zro.ai_credits": 600, "sobedesce.manifest_imports": 500, "synquei.organization_plans": 500}'::jsonb
         else '{"zro.ai_credits": 200, "sobedesce.manifest_imports": 200, "synquei.organization_plans": 200}'::jsonb
       end
from zro.plans n
join zro.plans o on o.version = 1 and o.code = case when n.code like 'absolute-zro-pro%' then 'ciclo-do-o' else regexp_replace(n.code, '-anual$', '') end
join zro.plan_products pp on pp.plan_id = o.id
where n.code in (
  'ciclo-do-o', 'ciclo-do-o-anual', 'absolute-zro-pro', 'absolute-zro-pro-anual', 'individual-carro-do-freela',
  'individual-carro-do-freela-anual', 'individual-tpeasy', 'individual-tpeasy-anual', 'individual-sobedesce',
  'individual-sobedesce-anual', 'individual-synquei', 'individual-synquei-anual', 'individual-nossom', 'individual-nossom-anual'
) and n.version = case when n.code in ('ciclo-do-o', 'individual-carro-do-freela', 'individual-tpeasy', 'individual-sobedesce', 'individual-synquei', 'individual-nossom') then 2 else 1 end
on conflict (plan_id, product_id) do nothing;

-- As versões sem preço saem da vitrine; quem já tem uma continua com ela (webhook e entitlements aceitam 'retired').
update zro.plans set status = 'retired'
where version = 1 and status = 'active' and code in ('ciclo-do-o', 'individual-carro-do-freela', 'individual-tpeasy', 'individual-sobedesce', 'individual-synquei', 'individual-nossom');

-- Ajustes da plataforma lidos por funções do banco. Só o sistema lê e grava (sem grant para zro_app).
create table if not exists zro.platform_settings (
  key text primary key check (key ~ '^[a-z0-9_.-]+$'),
  value jsonb not null,
  updated_by uuid references zro.users (id),
  updated_at timestamptz not null default now()
);
alter table zro.platform_settings enable row level security;
revoke all on zro.platform_settings from public;

-- Conta nova: plano grátis vigente e, com as vendas ligadas, o teste do Completo (sem cartão, provider 'trial').
-- Idempotente como antes: organização que já tem qualquer assinatura não recebe outra.
create or replace function zro.start_free_plan(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_plan uuid;
  v_sub uuid;
  v_trial jsonb;
  v_days int;
begin
  if exists (select 1 from zro.subscriptions s where s.org_id = p_org) then
    return;
  end if;
  select p.id into v_plan from zro.plans p
  where p.code = 'conta-absolute-zro' and p.kind = 'free' and p.status = 'active'
  order by p.version desc limit 1;
  if v_plan is not null then
    insert into zro.subscriptions (org_id, plan_id, status, current_period_start, provider, provider_subscription_id, provider_updated_at)
      values (p_org, v_plan, 'active', now(), 'free', 'free-' || p_org::text, now())
      returning id into v_sub;
    insert into zro.entitlements (org_id, product_id, features, limits, source, source_id, starts_at)
      select p_org, pp.product_id, pp.features, pp.limits, 'subscription', v_sub, now()
      from zro.plan_products pp join zro.products pr on pr.id = pp.product_id
      where pp.plan_id = v_plan and pr.stage in ('active', 'beta');
  end if;

  select s.value into v_trial from zro.platform_settings s where s.key = 'signup_trial';
  v_days := coalesce((v_trial ->> 'days')::int, 0);
  if v_days <= 0 then
    return;
  end if;
  select p.id into v_plan from zro.plans p
  where p.code = v_trial ->> 'plan_code' and p.status = 'active'
  order by p.version desc limit 1;
  if v_plan is null then
    return;
  end if;
  insert into zro.subscriptions (org_id, plan_id, status, current_period_start, current_period_end, provider, provider_subscription_id, provider_updated_at)
    values (p_org, v_plan, 'trialing', now(), now() + make_interval(days => v_days), 'trial', 'trial-' || p_org::text, now())
    returning id into v_sub;
  -- O teste dá as ferramentas do plano com poucos créditos de IA e GPU (custo real por conta nova).
  insert into zro.entitlements (org_id, product_id, features, limits, source, source_id, starts_at, ends_at)
    select p_org, pp.product_id, pp.features,
           case when pp.limits ? 'zro.ai_credits' then pp.limits || jsonb_build_object('zro.ai_credits', coalesce((v_trial ->> 'ai_credits')::int, 50)) else pp.limits end,
           'subscription', v_sub, now(), now() + make_interval(days => v_days)
    from zro.plan_products pp join zro.products pr on pr.id = pp.product_id
    where pp.plan_id = v_plan and pr.stage in ('active', 'beta');
end
$$;
revoke all on function zro.start_free_plan(uuid) from public;
;
insert into zro.schema_migrations (name, checksum) values ('0011_vendas.sql', 'd5611d69c80968113b446514e4d808c4f9441569bd9c597939d7243a7933c2ed');

-- ===== 0012_aeon.sql =====
-- Absolute ZRO HUB · 0012 · a plataforma de edição ganha nome: AEON (decisão do titular, 26/10/2026; marca em
-- docs/marca/aeon.md). O id técnico continua 'ai-edit' (contratos edit.selects.ready e edit.timeline.ready, planos e
-- acessos já usam). Segue em desenvolvimento: o estágio não muda. Só troca o que ainda está como a 0003 deixou.

update zro.products
   set name = 'AEON', provisional_name = false
 where id = 'ai-edit' and name = 'AI Edit';

update zro.products
   set role_in_flow = 'Edição com IA: transcrição, cortes e timeline para o seu editor',
       description = 'Em desenvolvimento. Transcrição, legenda, cortes e zoom propostos para aprovar e timeline para o seu editor.'
 where id = 'ai-edit' and description = 'Em desenvolvimento. Ainda não processa nada; os contratos de entrada e saída estão definidos.';
;
insert into zro.schema_migrations (name, checksum) values ('0012_aeon.sql', '29a593f81d176257430d202962d991a48d12b1d6fd25b172708825d00ea8fa55');

-- ===== 0013_aeon_revela_disponiveis.sql =====
-- Absolute ZRO HUB · 0013 · AEON e Revela disponíveis (decisão do titular, 26/10/2026): os dois sites estão no ar
-- (aeon.absolutezro.com e revela.absolutezro.com) e entram em todo plano que já dá "todas as ferramentas".
-- Ids técnicos continuam 'ai-edit' e 'finishing'.

update zro.products set stage = 'active' where id in ('ai-edit', 'finishing') and stage = 'coming_soon';
update zro.products set external_url = 'https://aeon.absolutezro.com' where id = 'ai-edit' and external_url is null;
update zro.products set external_url = 'https://revela.absolutezro.com' where id = 'finishing' and external_url is null;
update zro.products
   set description = 'Edição com IA: transcrição, legenda, cortes e zoom propostos para aprovar e timeline para o seu editor.'
 where id = 'ai-edit' and description like 'Em desenvolvimento.%';
update zro.products
   set description = 'Cor no DaVinci Resolve: LUT criativa a partir de um frame de referência, LUTs por câmera e entregas por destino.'
 where id = 'finishing' and description like 'Em desenvolvimento.%';

-- Os planos vigentes que já levam todas as ferramentas (Completo, Pro e a conta grátis de hoje) ganham os dois, com os
-- mesmos limites que o plano dá às outras ferramentas (créditos de IA e GPU iguais).
insert into zro.plan_products (plan_id, product_id, features, limits)
select p.id, novo.id, null,
       coalesce((select pp.limits from zro.plan_products pp where pp.plan_id = p.id order by pp.product_id limit 1), '{}'::jsonb)
from zro.plans p
cross join (values ('ai-edit'), ('finishing')) as novo (id)
where p.status = 'active'
  and (p.code like 'ciclo-do-o%' or p.code like 'absolute-zro-pro%' or (p.kind = 'free' and p.code = 'conta-absolute-zro'))
on conflict (plan_id, product_id) do nothing;

-- Quem já tem assinatura vigente desses planos passa a ter os dois agora (o recálculo seguinte refaz igual).
insert into zro.entitlements (org_id, product_id, features, limits, source, source_id, starts_at, ends_at)
select s.org_id, pp.product_id, pp.features, pp.limits, 'subscription', s.id, now(),
       case when s.status = 'trialing' then s.current_period_end else null end
from zro.subscriptions s
join zro.plan_products pp on pp.plan_id = s.plan_id
where pp.product_id in ('ai-edit', 'finishing')
  and s.status in ('active', 'trialing')
  and (s.current_period_end is null or s.current_period_end > now() or s.status = 'active')
  and not exists (
    select 1 from zro.entitlements e
    where e.org_id = s.org_id and e.product_id = pp.product_id and e.status = 'active'
  );
;
insert into zro.schema_migrations (name, checksum) values ('0013_aeon_revela_disponiveis.sql', '449ef1a7003b4b0e8d42f25fc027a6ea44c983224912605ef952b1f5cbfc2630');

-- ===== 0014_aeon_editor_completo.sql =====
-- Absolute ZRO HUB · 0014 · AEON é editor completo (titular, 26/10/2026): a pessoa edita do começo ao fim, com a IA
-- como ajuda opcional. Só troca o texto que a 0013 gravou (se alguém já mudou no console, fica como está).

update zro.products
   set description = 'Editor de vídeo completo: linha do tempo, legenda e exportação para o seu editor, com IA para cortes e zoom quando você quiser.'
 where id = 'ai-edit'
   and description = 'Edição com IA: transcrição, legenda, cortes e zoom propostos para aprovar e timeline para o seu editor.';

update zro.products
   set role_in_flow = 'Edição de vídeo: linha do tempo, legenda e timeline para o seu editor'
 where id = 'ai-edit'
   and role_in_flow = 'Edição com IA: transcrição, cortes e timeline para o seu editor';
;
insert into zro.schema_migrations (name, checksum) values ('0014_aeon_editor_completo.sql', 'd36a56942d179d5147f803e3164a7d5bed933ce59cfe6b9c8b31216136611e40');

-- ===== 0014_carro_equipe.sql =====
-- Absolute ZRO HUB · 0014 · Carro do Freela → HUB: o job vira projeto e a equipe da escala vira a equipe do projeto.
-- 1. Escopo de API carro-do-freela.jobs: o site do Carro chama a API do HUB com o token da pessoa (Bearer), sem
--    cookie do HUB. Só o cliente do produto recebe o escopo; organização e papel continuam saindo do banco.
-- 2. Papel "guest" (convidado): entra na organização para os projetos em que foi escalado e vê só eles. Um freela
--    escalado num job não pode ver os outros projetos, a equipe, o plano nem os vínculos da produtora.
-- 3. Convite para um projeto: aceitar o convite já põe a pessoa na equipe daquele projeto. Quem gerencia projetos
--    (manager) pode convidar convidados; os demais papéis seguem só com dono e administrador.

-- ───────────── 1. escopo de API do Carro ─────────────

update zro.oauth_clients set scopes = scopes || array['carro-do-freela.jobs']
where (id = 'carrodofreela-web' or product_id = 'carro-do-freela') and not ('carro-do-freela.jobs' = any (scopes));

-- ───────────── 2. papel convidado ─────────────

alter table zro.memberships drop constraint if exists memberships_role_check;
alter table zro.memberships add constraint memberships_role_check
  check (role in ('owner', 'admin', 'manager', 'editor', 'viewer', 'billing', 'guest'));

alter table zro.invitations drop constraint if exists invitations_role_check;
alter table zro.invitations add constraint invitations_role_check
  check (role in ('admin', 'manager', 'editor', 'viewer', 'billing', 'guest'));

-- Membro de verdade: qualquer papel menos convidado. É o que libera o que é da organização inteira.
create or replace function zro.is_full_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(zro.member_role(p_org) <> 'guest', false)
$$;
revoke all on function zro.is_full_member(uuid) from public;
grant execute on function zro.is_full_member(uuid) to zro_app;

-- O convidado vê o próprio vínculo, nunca a lista de quem está na organização.
drop policy if exists memberships_select on zro.memberships;
create policy memberships_select on zro.memberships for select to zro_app
  using (user_id = zro.current_user_id() or (org_id = zro.current_org_id() and zro.is_full_member(org_id)));

drop policy if exists entitlements_select on zro.entitlements;
create policy entitlements_select on zro.entitlements for select to zro_app
  using (org_id = zro.current_org_id() and zro.is_full_member(org_id));
drop policy if exists quotas_select on zro.quotas;
create policy quotas_select on zro.quotas for select to zro_app
  using (org_id = zro.current_org_id() and zro.is_full_member(org_id));

drop policy if exists integration_links_select on zro.integration_links;
create policy integration_links_select on zro.integration_links for select to zro_app
  using (org_id = zro.current_org_id() and zro.is_full_member(org_id));

-- Eventos sem projeto são da organização inteira; os de projeto seguem quem pode ver o projeto.
do $$
declare t text;
begin
  foreach t in array array['workflow_events', 'workflow_runs'] loop
    execute format('drop policy if exists %I on zro.%I', t || '_select', t);
    execute format('create policy %I on zro.%I for select to zro_app using (org_id = zro.current_org_id() and '
      || '((project_id is null and zro.is_full_member(org_id)) or (project_id is not null and zro.can_view_project(project_id))))', t || '_select', t);
  end loop;
end
$$;

-- ───────────── 3. convite para um projeto ─────────────

alter table zro.invitations add column if not exists project_id uuid references zro.projects (id) on delete cascade;
alter table zro.invitations add column if not exists project_role text;
-- A conta da Absolute ZRO que foi escalada: o convite só pode ser aceito por ela (sem cadastro duplicado).
alter table zro.invitations add column if not exists invitee_user_id uuid references zro.users (id) on delete cascade;
alter table zro.invitations drop constraint if exists invitations_project_check;
alter table zro.invitations add constraint invitations_project_check check (
  (project_id is null) = (project_role is null)
  and (project_role is null or project_role in ('editor', 'viewer'))
  and (role <> 'guest' or project_id is not null)
);
create index if not exists invitations_project_idx on zro.invitations (project_id) where project_id is not null;

drop policy if exists invitations_select on zro.invitations;
create policy invitations_select on zro.invitations for select to zro_app
  using (org_id = zro.current_org_id()
         and (zro.has_org_role(org_id, array['owner', 'admin']) or (role = 'guest' and zro.has_org_role(org_id, array['manager']))));
drop policy if exists invitations_insert on zro.invitations;
create policy invitations_insert on zro.invitations for insert to zro_app
  with check (org_id = zro.current_org_id() and invited_by = zro.current_user_id()
              and (zro.has_org_role(org_id, array['owner', 'admin']) or (role = 'guest' and zro.has_org_role(org_id, array['manager'])))
              and (project_id is null or exists (select 1 from zro.projects p where p.id = project_id and p.org_id = zro.current_org_id())));

-- A função de cada pessoa na escala (câmera, edição...) acompanha a equipe do projeto e o convite.
alter table zro.project_members add column if not exists function text check (char_length(function) between 1 and 80);
alter table zro.invitations add column if not exists project_function text check (char_length(project_function) between 1 and 80);

-- Quem o convidado enxerga (nome, foto): só quem está com ele em algum projeto. Membro de verdade segue vendo a
-- organização inteira, convidados incluídos.
create or replace function zro.shares_org_with(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from zro.memberships a
    join zro.memberships b on b.org_id = a.org_id
    where a.user_id = zro.current_user_id() and b.user_id = p_user and a.status = 'active' and b.status = 'active'
      and a.org_id = zro.current_org_id()
      and (a.role <> 'guest' or exists (
        select 1 from zro.project_members x
        join zro.project_members y on y.project_id = x.project_id
        join zro.projects p on p.id = x.project_id
        where x.user_id = a.user_id and y.user_id = p_user and p.org_id = a.org_id))
  )
$$;
;
insert into zro.schema_migrations (name, checksum) values ('0014_carro_equipe.sql', '74a8c47c7cf1f58a0b82f8bed4c181c6de0a893fe299d8cbad762fe8e918b1de');

-- ===== 0015_perfil_unico.sql =====
-- Absolute ZRO HUB · 0015 · perfil único (pedido do titular, 27/10/2026): a conta Absolute ZRO é o perfil de todas as
-- plataformas, como o Adobe ID. Nome, e-mail e foto são editados num lugar só (/perfil) e cada app lê do login único
-- (claims name, picture, updated_at). A foto ganha um endereço público e impossível de adivinhar, que muda a cada foto
-- nova: os apps mostram a foto sem cookie do HUB e nunca exibem uma versão velha por cache.

alter table zro.user_avatars add column if not exists public_id uuid not null default gen_random_uuid();
create unique index if not exists user_avatars_public_id on zro.user_avatars (public_id);

create or replace function zro.user_avatars_novo_endereco() returns trigger
language plpgsql as $$
begin
  if new.data is distinct from old.data or new.content_type is distinct from old.content_type then
    new.public_id := gen_random_uuid();
  end if;
  return new;
end
$$;
create or replace trigger user_avatars_novo_endereco before update on zro.user_avatars
  for each row execute function zro.user_avatars_novo_endereco();
;
insert into zro.schema_migrations (name, checksum) values ('0015_perfil_unico.sql', '2b4454a3587e4cae11f1b7c60a42c53b784615c9459a008e0e173a62690cab44');

-- ===== 0016_ia_ecossistema.sql =====
-- Absolute ZRO HUB · 0016 · a IA do ecossistema (pedido do titular, 27/10/2026): uma IA só para todas as plataformas,
-- alimentada pelos dados da conta. Cada conversa nasce numa plataforma (product_id; nulo = o próprio HUB) e fica com a
-- pessoa que conversou: cada plataforma lista as suas e o app Absolute ZRO mostra todas, separadas por plataforma.
-- Conversa é pessoal: nem quem administra a organização lê a de outra pessoa (RLS por user_id).

create table if not exists zro.ia_conversas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references zro.organizations (id) on delete cascade,
  user_id uuid not null references zro.users (id) on delete cascade,
  product_id text references zro.products (id) on delete set null,
  titulo text not null default 'Nova conversa' check (char_length(titulo) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ia_conversas_pessoa on zro.ia_conversas (user_id, updated_at desc);

create table if not exists zro.ia_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references zro.ia_conversas (id) on delete cascade,
  user_id uuid not null references zro.users (id) on delete cascade,
  papel text not null check (papel in ('user', 'assistant')),
  texto text not null check (char_length(texto) between 1 and 40000),
  creditos integer not null default 0 check (creditos >= 0),
  created_at timestamptz not null default now()
);
create index if not exists ia_mensagens_conversa on zro.ia_mensagens (conversa_id, created_at);

create or replace trigger ia_conversas_touch before update on zro.ia_conversas
  for each row execute function zro.touch_updated_at();

alter table zro.ia_conversas enable row level security;
alter table zro.ia_mensagens enable row level security;
alter table zro.ia_conversas force row level security;
alter table zro.ia_mensagens force row level security;

grant select, insert, update, delete on zro.ia_conversas, zro.ia_mensagens to zro_app;

drop policy if exists ia_conversas_pessoa on zro.ia_conversas;
create policy ia_conversas_pessoa on zro.ia_conversas for all to zro_app
  using (user_id = zro.current_user_id())
  with check (user_id = zro.current_user_id() and zro.member_role(org_id) is not null);

drop policy if exists ia_mensagens_pessoa on zro.ia_mensagens;
create policy ia_mensagens_pessoa on zro.ia_mensagens for all to zro_app
  using (user_id = zro.current_user_id())
  with check (
    user_id = zro.current_user_id()
    and exists (select 1 from zro.ia_conversas c where c.id = conversa_id and c.user_id = zro.current_user_id())
  );

-- Cada app da família pode usar a IA com o token do login único (escopo zro.ia), sem pedir permissão de novo:
-- o escopo entra na lista do cliente e no consentimento de quem já entrou.
update zro.oauth_clients set scopes = scopes || array['zro.ia']
  where product_id is not null and not ('zro.ia' = any (scopes));
;
insert into zro.schema_migrations (name, checksum) values ('0016_ia_ecossistema.sql', 'fbb0f2c031abf732a67472f489e4a770dad37d63e40c1cf53bf50244d6a6a952');

-- ===== 0017_ia_custos.sql =====
-- Absolute ZRO HUB · 0017 · quanto custa a IA do ecossistema: cada resposta guarda o modelo e os tokens que o provedor
-- informou (entrada, saída e lidos do cache). O console da plataforma soma isso pela tabela de preços pública do modelo.
alter table zro.ia_mensagens add column if not exists modelo text;
alter table zro.ia_mensagens add column if not exists tokens_entrada integer not null default 0 check (tokens_entrada >= 0);
alter table zro.ia_mensagens add column if not exists tokens_saida integer not null default 0 check (tokens_saida >= 0);
alter table zro.ia_mensagens add column if not exists tokens_cache integer not null default 0 check (tokens_cache >= 0);
create index if not exists ia_mensagens_quando on zro.ia_mensagens (created_at) where papel = 'assistant';
;
insert into zro.schema_migrations (name, checksum) values ('0017_ia_custos.sql', 'da538b76487654006bfb27da23594a6c8e3fe54150ff6dad0c9d833dd808fe4c');

-- ===== 0018_release_gate.sql =====
-- Absolute ZRO HUB · 0018 · gate de lançamento (PRD "integração, controle de acesso e lançamento progressivo" §5-§6,
-- adendo do Carro do Freela; ADR 0023). Fonte única, no servidor e deny-by-default, de "este produto está aberto ao
-- público?" e "quem pode entrar enquanto ele está fechado?". Entitlement (plano) continua separado: o gate decide se o
-- produto está lançado; o plano decide se a organização contratou.
--
-- - zro.product_release: uma linha por produto. Sem linha = fechado (um produto novo nasce fechado).
-- - zro.product_release_access: contas autorizadas por produto enquanto ele está fechado, por user_id (nunca por e-mail
--   nem por papel: admin da plataforma não entra sozinho). Cada conta diz em quais canais entra e até quando.
-- - zro.release_allows(produto, pessoa, canal): a regra, lida por toda checagem (HUB, login único, API, catálogo).
-- Auditoria só-inclusão em zro.audit_logs por trigger: toda mudança de estado ou de acesso fica registrada, inclusive
-- as feitas direto no SQL Editor.

create table if not exists zro.product_release (
  product_id text primary key references zro.products (id) on delete cascade,
  state text not null check (state in ('development', 'internal_beta', 'private_beta', 'public_beta', 'released', 'retired')),
  -- Canais abertos ao público quando o estado é released ou public_beta. Nos outros estados, só a lista de acesso vale.
  web boolean not null default false,
  desktop boolean not null default false,
  api boolean not null default false,
  download boolean not null default false,
  sso boolean not null default false,
  note text not null default '' check (char_length(note) <= 500),
  updated_by uuid references zro.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create or replace trigger product_release_touch before update on zro.product_release for each row execute function zro.touch_updated_at();

create table if not exists zro.product_release_access (
  product_id text not null references zro.products (id) on delete cascade,
  user_id uuid not null references zro.users (id) on delete cascade,
  kind text not null check (kind in ('owner', 'internal', 'tester')),
  channels text[] not null default array['web', 'desktop', 'api', 'download', 'sso']
    check (cardinality(channels) >= 1 and channels <@ array['web', 'desktop', 'api', 'download', 'sso']),
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  granted_by uuid references zro.users (id) on delete set null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz check (ends_at is null or ends_at > starts_at),
  revoked_at timestamptz,
  revoked_by uuid references zro.users (id) on delete set null,
  revoke_reason text check (revoke_reason is null or char_length(revoke_reason) <= 500),
  created_at timestamptz not null default now(),
  primary key (product_id, user_id)
);
create index if not exists product_release_access_user_idx on zro.product_release_access (user_id) where revoked_at is null;

-- A regra. Estado released/public_beta: o canal precisa estar aberto ao público, ou a conta estar na lista para aquele
-- canal (teste interno de um canal ainda fechado). retired: ninguém. Qualquer outro estado (ou sem linha): só quem está
-- na lista, vigente, sem revogação, naquele canal. Pessoa nula (anônimo) nunca entra num produto fechado.
create or replace function zro.release_allows(p_product text, p_user uuid, p_channel text) returns boolean
language sql stable security definer set search_path = '' as $$
  with r as (select * from zro.product_release where product_id = p_product),
  listed as (
    select exists (
      select 1 from zro.product_release_access a
      where a.product_id = p_product and p_user is not null and a.user_id = p_user and a.revoked_at is null
        and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())
        and p_channel = any (a.channels)
    ) as ok
  )
  select coalesce((
    select case
      when r.state = 'retired' then false
      when r.state in ('released', 'public_beta') then
        (case p_channel when 'web' then r.web when 'desktop' then r.desktop when 'api' then r.api
                        when 'download' then r.download when 'sso' then r.sso else false end)
        or (select ok from listed)
      else (select ok from listed)
    end
    from r), false)
$$;
revoke all on function zro.release_allows(text, uuid, text) from public;
grant execute on function zro.release_allows(text, uuid, text) to zro_app;

-- Auditoria (só-inclusão, como o resto de zro.audit_logs): quem mudou (updated_by / granted_by / revoked_by, ou a pessoa
-- da transação), o quê e com que motivo. Nunca e-mail nem conteúdo privado; a pessoa autorizada aparece pelo id.
create or replace function zro.release_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_action text;
  v_actor uuid;
  v_meta jsonb;
  v_target text;
begin
  if tg_table_name = 'product_release' then
    if tg_op = 'DELETE' then
      v_action := 'release.state_removed';
      v_actor := zro.current_user_id();
      v_target := old.product_id;
      v_meta := jsonb_build_object('before', old.state);
    else
      v_action := case when tg_op = 'INSERT' then 'release.state_set' else 'release.state_changed' end;
      v_actor := coalesce(new.updated_by, zro.current_user_id());
      v_target := new.product_id;
      v_meta := jsonb_build_object(
        'state', new.state,
        'before', case when tg_op = 'UPDATE' then old.state else null end,
        'channels', jsonb_build_object('web', new.web, 'desktop', new.desktop, 'api', new.api, 'download', new.download, 'sso', new.sso),
        'note', new.note);
    end if;
  else
    if tg_op = 'DELETE' then
      v_action := 'release.access_removed';
      v_actor := zro.current_user_id();
      v_target := old.product_id;
      v_meta := jsonb_build_object('user_id', old.user_id, 'kind', old.kind);
    else
      if tg_op = 'INSERT' then
        v_action := 'release.access_granted';
        v_actor := coalesce(new.granted_by, zro.current_user_id());
      elsif new.revoked_at is not null and old.revoked_at is null then
        v_action := 'release.access_revoked';
        v_actor := coalesce(new.revoked_by, zro.current_user_id());
      else
        v_action := 'release.access_changed';
        v_actor := coalesce(new.granted_by, zro.current_user_id());
      end if;
      v_target := new.product_id;
      v_meta := jsonb_build_object(
        'user_id', new.user_id, 'kind', new.kind, 'channels', to_jsonb(new.channels), 'reason', new.reason,
        'starts_at', new.starts_at, 'ends_at', new.ends_at, 'revoked_at', new.revoked_at, 'revoke_reason', new.revoke_reason);
    end if;
  end if;
  insert into zro.audit_logs (actor_user_id, actor_kind, action, target_type, target_id, metadata)
    values (v_actor, 'admin', v_action, 'product', v_target, v_meta);
  return null;
end
$$;
drop trigger if exists product_release_audit on zro.product_release;
create trigger product_release_audit after insert or update or delete on zro.product_release
  for each row execute function zro.release_audit();
drop trigger if exists product_release_access_audit on zro.product_release_access;
create trigger product_release_access_audit after insert or update or delete on zro.product_release_access
  for each row execute function zro.release_audit();

-- RLS: o estado é público (a página "Em desenvolvimento" e os apps mostram o estado real); a lista de acesso é só do
-- sistema (console depois de requirePlatformAdmin e a função acima). Escrita nas duas só pelo sistema.
alter table zro.product_release enable row level security;
alter table zro.product_release_access enable row level security;
revoke all on zro.product_release, zro.product_release_access from zro_app;
grant select on zro.product_release to zro_app;
drop policy if exists product_release_select on zro.product_release;
create policy product_release_select on zro.product_release for select to zro_app using (true);

-- Estado inicial (decisão do proprietário, 28/10/2026): SOBEDESCE, Synquei e TPeasy lançados em todos os canais;
-- NOSSOM, AEON (ai-edit), Revela (finishing) e Carro do Freela em desenvolvimento, com todos os canais fechados.
-- Produto que ainda não existe no catálogo (ex.: maestro) não ganha linha aqui: sem linha = fechado.
insert into zro.product_release (product_id, state, web, desktop, api, download, sso, note)
select p.id, 'released', true, true, true, true, true, 'Lançado (decisão do proprietário, 28/10/2026).'
from zro.products p where p.id in ('sobedesce', 'synquei', 'tpeasy')
on conflict (product_id) do nothing;

insert into zro.product_release (product_id, state, note)
select p.id, 'development', 'Fechado ao público até autorização expressa do proprietário (PRD 27/10/2026).'
from zro.products p where p.id in ('nossom', 'ai-edit', 'finishing', 'carro-do-freela')
on conflict (product_id) do nothing;

-- A conta do proprietário (adendo do Carro: a ÚNICA autorizada nos quatro fechados) entra em produção na publicação,
-- pelo console (Administração › Lançamento › Acesso interno) ou pelo SQL Editor, nunca por esta migration nem por código.
-- Exemplo (trocar <uuid> pelo zro.users.id da conta; o e-mail não serve de chave):
--   insert into zro.product_release_access (product_id, user_id, kind, reason, granted_by)
--   select x.product_id, u.id, 'owner', 'conta do proprietário (adendo do PRD, 27/10/2026)', u.id
--   from zro.users u cross join (values ('carro-do-freela'), ('nossom'), ('ai-edit'), ('finishing')) as x (product_id)
--   where u.id = '<uuid>'
--   on conflict (product_id, user_id) do nothing;
;
insert into zro.schema_migrations (name, checksum) values ('0018_release_gate.sql', '54dae2818055273f6e9dbca7c79eb186042cefbfe23fa426748076380edb44e7');

-- ===== 0019_maestro.sql =====
-- Absolute ZRO HUB · 0019 · o Maestro entra no catálogo (ADR 0022; decisão do titular, 28/10/2026).
-- Plataforma nova em products/maestro: pauta (Quadro), aprovação do cliente e projetos para agências e produtoras.
-- Nasce fechada: stage 'coming_soon' (o gate de lançamento da 0018 decide quando e para quem abre; o Maestro só deixa
-- entrar quem tem 'maestro' em zro_products, concedido pelo console). Sem endereço público ainda: external_url e
-- sso_start_url ficam vazios até o projeto Vercel e o domínio maestro.absolutezro.com serem autorizados pelo titular.
-- Planos não mudam (avulso, decisão 7): entitlement de teste só por concessão do console.
-- step_order 8: a última etapa do Ciclo do O (components/cycle-o.tsx divide o anel pelo número de etapas).

insert into zro.products (id, name, stage, step_order, role_in_flow, description, integration_mode, external_url, provisional_name) values
  ('maestro', 'Maestro', 'coming_soon', 8, 'Pauta, aprovação do cliente e projetos para agências e produtoras',
   'Em desenvolvimento. Quadro de pautas em oito colunas, aprovação do cliente por link sem conta e projetos ligados ao projeto da Absolute ZRO.',
   'api_adapter', null, false)
on conflict (id) do nothing;

-- O projeto do Maestro liga-se ao projeto canônico do HUB ao nascer (contrato maestro.project/1, etapa 3). Sem métrica.
insert into zro.product_features (product_id, feature_key, description, metric) values
  ('maestro', 'project_link', 'Ligar um projeto do Maestro ao projeto da Absolute ZRO (maestro.project/1)', null)
on conflict (product_id, feature_key) do nothing;
;
insert into zro.schema_migrations (name, checksum) values ('0019_maestro.sql', '646c58dce5597a32f7a239d82fa364df015311ab1a1b59a2267183249f63228e');

-- ===== 0020_creditos_ia_gratis.sql =====
-- Absolute ZRO HUB · 0020 · 50 créditos de IA por mês no plano grátis (decisão do titular, 28/10/2026).
-- Antes a conta grátis nascia sem limite de zro.ai_credits e, pela regra "sem limite configurado = bloqueado", a Z
-- dizia que os créditos tinham acabado. O limite vale por organização (consumeQuota lê o maior limite entre os
-- entitlements ativos). Mudar o valor depois: nova versão do plano no console, nunca editar esta migration.

-- O plano grátis vigente passa a trazer os 50 créditos em cada ferramenta que inclui.
update zro.plan_products pp
   set limits = pp.limits || '{"zro.ai_credits": 50}'::jsonb
  from zro.plans p
 where p.id = pp.plan_id
   and p.code = 'conta-absolute-zro' and p.kind = 'free' and p.status = 'active'
   and not (pp.limits ? 'zro.ai_credits');

-- Contas que já existem no grátis ganham o mesmo limite nos entitlements da assinatura grátis (idempotente).
update zro.entitlements e
   set limits = e.limits || '{"zro.ai_credits": 50}'::jsonb
  from zro.subscriptions s
  join zro.plans p on p.id = s.plan_id
 where e.source = 'subscription' and e.source_id = s.id and e.status = 'active'
   and p.code = 'conta-absolute-zro' and p.kind = 'free'
   and not (e.limits ? 'zro.ai_credits');
;
insert into zro.schema_migrations (name, checksum) values ('0020_creditos_ia_gratis.sql', '0b92cc8a04130498a8bd5b56770585ff3754b02742030b63b25b6341186a007f');

-- ===== 0021_maestro_descricao.sql =====
-- Absolute ZRO HUB · 0021 · o que o Maestro vai ser, dito com clareza (pedido do titular, 28/10/2026).
-- A gestão da produtora: CRM e cadastro de clientes, financeiro, controle de pauta e aprovação do cliente. Só texto do
-- catálogo; o estado de lançamento continua no gate (0018).
update zro.products
   set role_in_flow = 'Gestão da produtora: CRM, financeiro, pauta e aprovação do cliente',
       description = 'Em desenvolvimento. A gestão da sua produtora num lugar só: CRM e clientes, financeiro, controle de pauta e aprovação do cliente por link.'
 where id = 'maestro';
;
insert into zro.schema_migrations (name, checksum) values ('0021_maestro_descricao.sql', '61ffd5b554cebadc46b04304424baa37654771f95bc7840db99d37793ba598c4');

-- ===== 0023_excluir_conta.sql =====
-- Absolute ZRO HUB · 0023 · excluir a conta (pedido do titular, 28/10/2026).
-- A pessoa exclui a própria conta em Sua conta › Segurança. A linha de zro.users fica (auditoria e dados financeiros
-- que a lei manda guardar apontam para ela), mas sem nada pessoal: e-mail trocado por um endereço único e inválido,
-- nome e foto apagados, status 'deleted'. O e-mail original fica livre para uma conta nova. Organizações só dela
-- são encerradas junto ('closed'): saem de todas as listas, que já filtram status = 'active'.
-- Código: packages/core/src/excluir-conta.ts. Testes: tests/integration/excluir-conta.test.ts.

alter table zro.users add column if not exists deleted_at timestamptz;
alter table zro.users drop constraint if exists users_deleted_at_status;
alter table zro.users add constraint users_deleted_at_status check ((status = 'deleted') = (deleted_at is not null));

alter table zro.organizations add column if not exists closed_at timestamptz;
alter table zro.organizations drop constraint if exists organizations_status_check;
alter table zro.organizations add constraint organizations_status_check check (status in ('active', 'suspended', 'closed'));
alter table zro.organizations drop constraint if exists organizations_closed_at_status;
alter table zro.organizations add constraint organizations_closed_at_status check ((status = 'closed') = (closed_at is not null));

-- A organização nunca fica sem dono ativo, exceto quando foi encerrada (a dona excluiu a conta).
create or replace function zro.keep_an_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_org uuid := coalesce(old.org_id, new.org_id);
begin
  if not exists (select 1 from zro.organizations o where o.id = v_org and o.status <> 'closed') then
    return null; -- organização apagada em cascata ou encerrada
  end if;
  if not exists (select 1 from zro.memberships m where m.org_id = v_org and m.role = 'owner' and m.status = 'active') then
    raise exception 'A organização precisa de pelo menos um dono ativo.' using errcode = '23514';
  end if;
  return null;
end
$$;

-- Organização encerrada não volta: nem o papel zro_app nem o console reabrem por update simples.
create or replace function zro.organization_closed_is_final() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'closed' and new.status <> 'closed' then
    raise exception 'Organização encerrada não pode ser reaberta.' using errcode = '42501';
  end if;
  return new;
end
$$;
drop trigger if exists organizations_closed_is_final on zro.organizations;
create trigger organizations_closed_is_final before update on zro.organizations
  for each row execute function zro.organization_closed_is_final();

-- Conta excluída não volta a ficar ativa (o e-mail original já pode ser de outra pessoa).
create or replace function zro.user_deleted_is_final() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'deleted' and new.status <> 'deleted' then
    raise exception 'Conta excluída não pode ser reativada.' using errcode = '42501';
  end if;
  return new;
end
$$;
drop trigger if exists users_deleted_is_final on zro.users;
create trigger users_deleted_is_final before update on zro.users
  for each row execute function zro.user_deleted_is_final();
;
insert into zro.schema_migrations (name, checksum) values ('0023_excluir_conta.sql', '051589c58d91853e746e5fd2db391f4ae25a897a0f61163c8d9a29a3ff240356');

-- ===== 0024_maestro_em_teste_fechado.sql =====
-- Absolute ZRO HUB · 0024 · Maestro no ar só para quem está na lista (decisão do titular, 28/10/2026).
-- Registra no código o que foi ajustado em produção: o produto existe como "beta" com endereço próprio (para a conta
-- liberada ver "Abrir" e receber o maestro em zro_products), mas o gate (0018) o mantém fechado ao público com estado
-- 'development'. Sem a linha em product_release, nem a lista de acesso entrava. Abrir a todos continua sendo a 0022.
update zro.products
   set stage = 'beta',
       external_url = 'https://maestro.absolutezro.com',
       sso_start_url = 'https://maestro.absolutezro.com/api/zro/entrar'
 where id = 'maestro';

insert into zro.product_release (product_id, state, web, desktop, api, download, sso, note)
values ('maestro', 'development', false, false, false, false, false, 'Em desenvolvimento; só a lista de acesso entra')
on conflict (product_id) do nothing;
;
insert into zro.schema_migrations (name, checksum) values ('0024_maestro_em_teste_fechado.sql', '735ed05d371dd73a2dbc5f60883d85d3b2a0f40ff6d94665d8569d950c1bd512');

-- No banco antigo o RLS desta tabela foi ligado à mão depois (o runner usa postgres, que passa por cima do RLS).
alter table zro.schema_migrations enable row level security;

select 'ok: passo 2b feito (HUB). Siga para o 2c.' as resultado;
