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
