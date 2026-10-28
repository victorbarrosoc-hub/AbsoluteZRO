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
