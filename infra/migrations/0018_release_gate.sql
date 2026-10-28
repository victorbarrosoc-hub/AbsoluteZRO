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
