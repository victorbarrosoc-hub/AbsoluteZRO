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
