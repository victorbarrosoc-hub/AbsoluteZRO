-- Absolute ZRO HUB · 0013 · Carro do Freela → HUB: o job vira projeto e a equipe da escala vira a equipe do projeto.
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
