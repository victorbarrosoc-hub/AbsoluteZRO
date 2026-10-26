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
