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
