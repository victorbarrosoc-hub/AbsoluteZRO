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
