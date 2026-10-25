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
