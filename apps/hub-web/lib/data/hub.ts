import 'server-only'
import type { Authenticated } from '@zro/auth'
import { productAccessFor, quotaPeriod } from '@zro/billing'
import { ADMIN_ROLES, authorize, BILLING_ROLES } from '@zro/core'
import { db } from '../session'

/** Início: projetos recentes, pendências reais, uso do plano e ferramentas. */
export async function homeData(auth: Authenticated) {
  const actor = await authorize(db(), auth)
  return db().asUser({ userId: actor.userId, orgId: actor.orgId }, async (tx) => {
    const [org] = await tx`select name from zro.organizations where id = ${actor.orgId}`
    const projects =
      await tx`select id, title, status, updated_at from zro.projects where org_id = ${actor.orgId} and status <> 'archived' order by updated_at desc limit 6`
    const [counts] = await tx`
      select (select count(*)::int from zro.projects where org_id = ${actor.orgId} and status <> 'archived') as projects,
             (select count(*)::int from zro.project_steps where org_id = ${actor.orgId} and state in ('needs_review', 'failed')) as attention,
             (select count(*)::int from zro.workflow_runs where org_id = ${actor.orgId} and status in ('queued', 'running')) as running,
             (select count(*)::int from zro.workflow_runs where org_id = ${actor.orgId} and status in ('failed', 'dead_letter', 'requires_review', 'blocked')) as stuck`
    const attention = await tx`
      select s.project_id, p.title, s.step_key, s.state, s.updated_at, pr.name as step_name
      from zro.project_steps s join zro.projects p on p.id = s.project_id join zro.products pr on pr.id = s.step_key
      where s.org_id = ${actor.orgId} and s.state in ('needs_review', 'failed') order by s.updated_at desc limit 8`
    const runs = await tx`
      select r.id, r.handler, r.status, r.updated_at, p.title as project_title, r.project_id
      from zro.workflow_runs r left join zro.projects p on p.id = r.project_id
      where r.org_id = ${actor.orgId} order by r.updated_at desc limit 6`
    const access = await productAccessFor(tx, actor.orgId)
    const { start } = quotaPeriod()
    const quotas =
      await tx`select metric, used, limit_value, period_end from zro.quotas where org_id = ${actor.orgId} and period_start = ${start} order by metric`
    return { actor, org, projects, counts: counts!, attention, runs, access, quotas }
  })
}

export async function subscriptionData(auth: Authenticated) {
  const actor = await authorize(db(), auth)
  const canSeeBilling = ['owner', 'admin', 'billing'].includes(actor.role)
  return db().asUser({ userId: actor.userId, orgId: actor.orgId }, async (tx) => {
    const subscriptions = canSeeBilling
      ? await tx`
          select s.id, s.status, s.current_period_end, s.cancel_at_period_end, s.grace_until, s.provider, p.name as plan_name, p.version
          from zro.subscriptions s join zro.plans p on p.id = s.plan_id where s.org_id = ${actor.orgId} order by s.created_at desc`
      : []
    const entitlements = await tx`
      select e.id, e.product_id, pr.name, e.source, e.ends_at, e.features, e.limits
      from zro.entitlements e join zro.products pr on pr.id = e.product_id
      where e.org_id = ${actor.orgId} and e.status = 'active' and (e.ends_at is null or e.ends_at > now()) order by pr.step_order`
    const { start, end } = quotaPeriod()
    const quotas = await tx`select metric, used, limit_value from zro.quotas where org_id = ${actor.orgId} and period_start = ${start} order by metric`
    const access = await productAccessFor(tx, actor.orgId)
    return { actor, canSeeBilling, subscriptions, entitlements, quotas, period: { start, end }, access }
  })
}

export async function filesData(auth: Authenticated) {
  const actor = await authorize(db(), auth)
  return db().asUser({ userId: actor.userId, orgId: actor.orgId }, async (tx) => {
    const manifests = await tx`
      select m.id, m.project_id, p.title as project_title, m.manifest_id, m.source_app, m.status, m.verification, m.created_at,
        (select count(*)::int from zro.project_assets a where a.manifest_row_id = m.id) as assets
      from zro.media_manifests m join zro.projects p on p.id = m.project_id
      where m.org_id = ${actor.orgId} order by m.created_at desc limit 100`
    const [totals] = await tx`
      select count(distinct a.id)::int as assets, coalesce(sum(a.size_bytes), 0)::float8 as bytes,
        count(l.id) filter (where l.status = 'verified')::int as verified,
        count(l.id) filter (where l.status = 'unverified')::int as unverified,
        count(l.id) filter (where l.status in ('mismatch', 'missing', 'failed'))::int as problems
      from zro.project_assets a left join zro.asset_locations l on l.asset_id = a.id
      where a.org_id = ${actor.orgId}`
    return { actor, manifests, totals: totals! }
  })
}

export async function projectAssets(auth: Authenticated, projectId: string) {
  const actor = await authorize(db(), auth, { project: { id: projectId, access: 'view' } })
  return db().asUser(
    { userId: actor.userId, orgId: actor.orgId },
    (tx) => tx`
    select a.id, a.asset_key, a.original_name, a.relative_path, a.size_bytes, a.camera, a.card,
      coalesce(json_agg(json_build_object('label', l.destination_label, 'status', l.status, 'uri', l.uri,
        'checksum', (select c.algorithm || ':' || c.value from zro.asset_checksums c where c.location_id = l.id limit 1))
        order by l.destination_label) filter (where l.id is not null), '[]') as locations
    from zro.project_assets a left join zro.asset_locations l on l.asset_id = a.id
    where a.project_id = ${projectId} group by a.id order by a.relative_path limit 500`,
  )
}

export async function auditData(auth: Authenticated) {
  const actor = await authorize(db(), auth)
  const rows = await db().asUser(
    { userId: actor.userId, orgId: actor.orgId },
    (tx) => tx`
    select l.id, l.action, l.actor_kind, l.target_type, l.target_id, l.created_at, u.display_name as actor_name
    from zro.audit_logs l left join zro.users u on u.id = l.actor_user_id
    where l.org_id = ${actor.orgId} or l.actor_user_id = ${actor.userId} order by l.created_at desc limit 100`,
  )
  return { actor, rows, full: ADMIN_ROLES.includes(actor.role) }
}

export async function profileData(auth: Authenticated) {
  return db().asUser(
    { userId: auth.user.id, orgId: auth.session.activeOrgId },
    (tx) => tx`
    select id, user_agent, created_at, last_used_at, expires_at from zro.sessions
    where user_id = ${auth.user.id} and revoked_at is null and expires_at > now() order by last_used_at desc`,
  )
}

/** Perfil › Apps com acesso (RLS: só os consentimentos da própria pessoa). */
export async function connectedAppsData(auth: Authenticated) {
  return db().asUser(
    { userId: auth.user.id, orgId: auth.session.activeOrgId },
    (tx) => tx`
    select c.client_id, c.scopes, c.granted_at, cl.name, cl.product_id, a.first_login_at, a.last_login_at from zro.oauth_consents c
    join zro.oauth_clients cl on cl.id = c.client_id
    left join zro.app_accounts a on a.user_id = c.user_id and a.client_id = c.client_id
    where c.user_id = ${auth.user.id} and c.revoked_at is null order by c.granted_at desc`,
  )
}

/** Sua conta › Plano: plano da organização ativa, planos para upgrade e pedidos abertos. */
export async function planCenterData(auth: Authenticated) {
  const actor = await authorize(db(), auth)
  const canManage = BILLING_ROLES.includes(actor.role)
  return db().asUser({ userId: actor.userId, orgId: actor.orgId }, async (tx) => {
    const [org] = await tx`select name from zro.organizations where id = ${actor.orgId}`
    const subscriptions = canManage
      ? await tx`
          select s.id, s.status, s.provider, s.current_period_end, s.cancel_at_period_end, s.grace_until, p.id as plan_id, p.code, p.name, p.kind
          from zro.subscriptions s join zro.plans p on p.id = s.plan_id
          where s.org_id = ${actor.orgId} and s.status in ('active', 'trialing', 'past_due')
            and (s.current_period_end is null or s.current_period_end > now() or s.grace_until > now()) order by s.created_at desc`
      : []
    const plans = await tx`
      select p.id, p.code, p.name, p.kind, p.description, p.price_cents, p.currency, p.billing_interval,
             (select count(*)::int from zro.plan_products pp where pp.plan_id = p.id) as products
      from zro.plans p where p.status = 'active' and p.kind <> 'free'
      order by case p.kind when 'bundle' then 0 else 1 end, p.name`
    const requests = canManage
      ? await tx`
          select r.id, r.kind, r.created_at, p.name as plan from zro.plan_requests r left join zro.plans p on p.id = r.plan_id
          where r.org_id = ${actor.orgId} and r.status = 'open' order by r.created_at desc`
      : []
    return { actor, canManage, org: org!, subscriptions, plans, requests }
  })
}

/** Sua conta › visão geral: números que resumem as outras seções. */
export async function accountSummary(auth: Authenticated) {
  return db().asUser({ userId: auth.user.id, orgId: auth.session.activeOrgId }, async (tx) => {
    const [r] = await tx`
      select (select count(*)::int from zro.sessions where user_id = ${auth.user.id} and revoked_at is null and expires_at > now()) as sessions,
             (select count(*)::int from zro.oauth_consents where user_id = ${auth.user.id} and revoked_at is null) as apps,
             (select count(*)::int from zro.memberships m join zro.organizations o on o.id = m.org_id
               where m.user_id = ${auth.user.id} and m.status = 'active' and o.status = 'active') as orgs,
             (select count(*)::int from zro.entitlements e where e.org_id = ${auth.session.activeOrgId} and e.status = 'active'
               and (e.ends_at is null or e.ends_at > now())) as tools`
    return r! as { sessions: number; apps: number; orgs: number; tools: number }
  })
}
