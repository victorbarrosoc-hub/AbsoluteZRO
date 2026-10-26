/**
 * Painel de pessoas do console (/admin/pessoas): quem entrou, em que plano está cada organização e o que cada
 * pessoa usa. Quem chama já passou por requirePlatformAdmin; tudo roda como sistema (sem RLS).
 * Os números vêm só do que o HUB registra de verdade: contas, sessões, contas por app (0006), códigos do login
 * único emitidos (uma entrada num app) e vínculos com o Google (0008).
 */
import { providerLabel } from '@zro/billing'
import type { Queryable } from '@zro/db'
import { audit, DomainError } from '@zro/observability'

const TZ = 'America/Fortaleza'
const LIVE_SUB = ['active', 'trialing', 'past_due']

export type PeopleOrder = 'recentes' | 'acesso' | 'nome'
export type PeopleFlag = 'google' | 'suspensas' | 'sem-org'
export type PeopleFilter = {
  q: string
  /** client_id do app (zro.oauth_clients). */
  app: string | null
  /** Código do plano (todas as versões) ou "sem-plano". */
  plan: string | null
  flag: PeopleFlag | null
  order: PeopleOrder
}

export const PEOPLE_ORDERS: Record<PeopleOrder, string> = { recentes: 'Mais recentes', acesso: 'Último acesso', nome: 'Nome' }
export const PEOPLE_FLAGS: Record<PeopleFlag, string> = { google: 'Google ligado', suspensas: 'Suspensas', 'sem-org': 'Sem organização' }
export const NO_PLAN = 'sem-plano'

const one = (v: string | string[] | null | undefined) => (Array.isArray(v) ? (v[0] ?? '') : (v ?? '')).trim()

/** Lê a busca e os filtros da URL. Valor desconhecido vira "sem filtro". */
export function parsePeopleFilter(params: URLSearchParams | Record<string, string | string[] | undefined>): PeopleFilter {
  const get = (k: string) => one(params instanceof URLSearchParams ? params.get(k) : params[k])
  const flag = get('f')
  const order = get('o')
  const app = get('app')
  const plan = get('plano')
  return {
    q: get('q').slice(0, 100),
    app: /^[a-z0-9][a-z0-9-]{2,62}$/.test(app) ? app : null,
    plan: /^[a-z0-9-]{1,80}$/.test(plan) ? plan : null,
    flag: flag in PEOPLE_FLAGS ? (flag as PeopleFlag) : null,
    order: order in PEOPLE_ORDERS ? (order as PeopleOrder) : 'recentes',
  }
}

/** Filtro de volta para a URL (sem os valores padrão). */
export function peopleFilterQuery(f: PeopleFilter, change: Partial<PeopleFilter> = {}): string {
  const v = { ...f, ...change }
  const q = new URLSearchParams()
  if (v.q) q.set('q', v.q)
  if (v.app) q.set('app', v.app)
  if (v.plan) q.set('plano', v.plan)
  if (v.flag) q.set('f', v.flag)
  if (v.order !== 'recentes') q.set('o', v.order)
  return q.toString()
}

export type PersonPlan = {
  subscriptionId: string
  planId: string
  planName: string
  planCode: string
  version: number
  kind: string
  provider: string
  status: string
  periodEnd: Date | null
}
export type PersonOrg = { orgId: string; name: string; role: string; status: string; plans: PersonPlan[] }
export type PersonApp = { clientId: string; name: string; productId: string | null; firstLoginAt: Date; lastLoginAt: Date; logins: number }
export type PersonRow = {
  id: string
  name: string
  email: string
  status: 'active' | 'suspended' | 'deleted'
  platformRole: 'admin' | 'support' | null
  emailVerified: boolean
  createdAt: Date
  hubLastSeenAt: Date | null
  /** Mais recente entre a sessão no HUB e a entrada num app. */
  lastSeenAt: Date | null
  google: boolean
  orgs: PersonOrg[]
  apps: PersonApp[]
}

const date = (v: unknown) => (v ? new Date(v as string) : null)

type RawOrg = { orgId: string; name: string; role: string; status: string; plans: (Omit<PersonPlan, 'periodEnd'> & { periodEnd: string | null })[] }
type RawApp = Omit<PersonApp, 'firstLoginAt' | 'lastLoginAt'> & { firstLoginAt: string; lastLoginAt: string }

function toPerson(r: Record<string, unknown>): PersonRow {
  const hub = date(r.hub_last_seen)
  const apps = ((r.apps as RawApp[]) ?? []).map((a) => ({ ...a, firstLoginAt: new Date(a.firstLoginAt), lastLoginAt: new Date(a.lastLoginAt) }))
  const lastApp = apps.reduce<Date | null>((m, a) => (!m || a.lastLoginAt > m ? a.lastLoginAt : m), null)
  return {
    id: r.id as string,
    name: (r.display_name as string) || (r.email as string).split('@')[0]!,
    email: r.email as string,
    status: r.status as PersonRow['status'],
    platformRole: (r.platform_role as PersonRow['platformRole']) ?? null,
    emailVerified: !!r.email_verified_at,
    createdAt: r.created_at as Date,
    hubLastSeenAt: hub,
    lastSeenAt: !hub ? lastApp : !lastApp ? hub : hub > lastApp ? hub : lastApp,
    google: !!r.google,
    orgs: ((r.orgs as RawOrg[]) ?? []).map((o) => ({ ...o, plans: o.plans.map((p) => ({ ...p, periodEnd: date(p.periodEnd) })) })),
    apps,
  }
}

/** Lista de pessoas com busca, filtros e ordem. `total` = todas as contas (para "x de y"). */
export async function listPeople(tx: Queryable, f: PeopleFilter, limit = 500): Promise<{ rows: PersonRow[]; total: number }> {
  const q = f.q.toLowerCase()
  const where = [
    q ? tx`and (position(${q} in lower(u.email)) > 0 or position(${q} in lower(u.display_name)) > 0)` : tx``,
    f.app ? tx`and exists (select 1 from zro.app_accounts a where a.user_id = u.id and a.client_id = ${f.app})` : tx``,
    f.plan === NO_PLAN
      ? tx`and not exists (select 1 from zro.memberships m join zro.subscriptions s on s.org_id = m.org_id
                           where m.user_id = u.id and m.status = 'active' and s.status = any(${LIVE_SUB}))`
      : f.plan
        ? tx`and exists (select 1 from zro.memberships m join zro.subscriptions s on s.org_id = m.org_id join zro.plans p on p.id = s.plan_id
                         where m.user_id = u.id and m.status = 'active' and s.status = any(${LIVE_SUB}) and p.code = ${f.plan})`
        : tx``,
    f.flag === 'google' ? tx`and exists (select 1 from zro.external_identities x where x.user_id = u.id and x.provider = 'google')` : tx``,
    f.flag === 'suspensas' ? tx`and u.status = 'suspended'` : tx``,
    f.flag === 'sem-org' ? tx`and not exists (select 1 from zro.memberships m where m.user_id = u.id and m.status = 'active')` : tx``,
  ]
  const order =
    f.order === 'nome'
      ? tx`lower(coalesce(nullif(u.display_name, ''), u.email)), u.created_at desc`
      : f.order === 'acesso'
        ? tx`greatest(hub_last_seen, app_last_seen) desc nulls last, u.created_at desc`
        : tx`u.created_at desc`
  const rows = await tx`
    select * from (
      select u.id, u.email, u.display_name, u.status, u.platform_role, u.email_verified_at, u.created_at,
        (select max(s.last_used_at) from zro.sessions s where s.user_id = u.id) as hub_last_seen,
        (select max(a.last_login_at) from zro.app_accounts a where a.user_id = u.id) as app_last_seen,
        exists (select 1 from zro.external_identities x where x.user_id = u.id and x.provider = 'google') as google,
        coalesce((
          select json_agg(json_build_object('clientId', a.client_id, 'name', c.name, 'productId', a.product_id,
                   'firstLoginAt', a.first_login_at, 'lastLoginAt', a.last_login_at, 'logins', a.logins) order by a.last_login_at desc)
          from zro.app_accounts a join zro.oauth_clients c on c.id = a.client_id where a.user_id = u.id), '[]'::json) as apps,
        coalesce((
          select json_agg(json_build_object('orgId', o.id, 'name', o.name, 'role', m.role, 'status', o.status, 'plans', coalesce((
                   select json_agg(json_build_object('subscriptionId', s.id, 'planId', p.id, 'planName', p.name, 'planCode', p.code,
                            'version', p.version, 'kind', p.kind, 'provider', s.provider, 'status', s.status, 'periodEnd', s.current_period_end)
                          order by s.created_at desc)
                   from zro.subscriptions s join zro.plans p on p.id = s.plan_id
                   where s.org_id = o.id and s.status = any(${LIVE_SUB})), '[]'::json)) order by m.created_at)
          from zro.memberships m join zro.organizations o on o.id = m.org_id where m.user_id = u.id and m.status = 'active'), '[]'::json) as orgs
      from zro.users u
      where u.status <> 'deleted' ${where[0]!} ${where[1]!} ${where[2]!} ${where[3]!} ${where[4]!} ${where[5]!}
    ) u
    order by ${order}
    limit ${limit}`
  const [t] = await tx`select count(*)::int as n from zro.users where status <> 'deleted'`
  return { rows: rows.map(toPerson), total: t!.n as number }
}

export type PeopleSummary = {
  accounts: number
  new7: number
  new30: number
  active7: number
  suspended: number
  google: number
  noOrg: number
  funnel: { label: string; n: number }[]
  apps: { clientId: string; name: string; productId: string | null; accounts: number; new30: number; active7: number }[]
  /** Últimos 30 dias (fuso de Fortaleza), do mais antigo a hoje. */
  series: { day: string; signups: number; appLogins: number }[]
}

/** Números do topo, contas por app, funil e a série de 30 dias. */
export async function peopleSummary(tx: Queryable): Promise<PeopleSummary> {
  const [n] = await tx`
    select count(*)::int as accounts,
      count(*) filter (where u.created_at > now() - interval '7 days')::int as new7,
      count(*) filter (where u.created_at > now() - interval '30 days')::int as new30,
      count(*) filter (where u.status = 'suspended')::int as suspended,
      count(*) filter (where u.email_verified_at is not null)::int as verified,
      count(*) filter (where exists (select 1 from zro.external_identities x where x.user_id = u.id and x.provider = 'google'))::int as google,
      count(*) filter (where exists (select 1 from zro.memberships m where m.user_id = u.id and m.status = 'active'))::int as with_org,
      count(*) filter (where exists (select 1 from zro.app_accounts a where a.user_id = u.id))::int as with_app,
      count(*) filter (where exists (select 1 from zro.sessions s where s.user_id = u.id and s.last_used_at > now() - interval '7 days')
                          or exists (select 1 from zro.app_accounts a where a.user_id = u.id and a.last_login_at > now() - interval '7 days'))::int as active7
    from zro.users u where u.status <> 'deleted'`
  const apps = await tx`
    select c.id, c.name, c.product_id,
      count(a.user_id)::int as accounts,
      count(a.user_id) filter (where a.first_login_at > now() - interval '30 days')::int as new30,
      count(a.user_id) filter (where a.last_login_at > now() - interval '7 days')::int as active7
    from zro.oauth_clients c left join zro.app_accounts a on a.client_id = c.id
    group by c.id order by count(a.user_id) desc, c.name`
  const series = await tx`
    with d as (
      select generate_series((now() at time zone ${TZ})::date - 29, (now() at time zone ${TZ})::date, interval '1 day')::date as day
    ), s as (
      select (created_at at time zone ${TZ})::date as day, count(*)::int as n from zro.users
      where status <> 'deleted' and created_at > now() - interval '31 days' group by 1
    ), a as (
      select (created_at at time zone ${TZ})::date as day, count(*)::int as n from zro.oauth_codes
      where created_at > now() - interval '31 days' group by 1
    )
    select to_char(d.day, 'YYYY-MM-DD') as day, coalesce(s.n, 0)::int as signups, coalesce(a.n, 0)::int as app_logins
    from d left join s on s.day = d.day left join a on a.day = d.day order by d.day`
  const r = n!
  return {
    accounts: r.accounts as number,
    new7: r.new7 as number,
    new30: r.new30 as number,
    active7: r.active7 as number,
    suspended: r.suspended as number,
    google: r.google as number,
    noOrg: (r.accounts as number) - (r.with_org as number),
    funnel: [
      { label: 'Criou a conta', n: r.accounts as number },
      { label: 'Confirmou o e-mail', n: r.verified as number },
      { label: 'Criou ou entrou numa organização', n: r.with_org as number },
      { label: 'Entrou num app', n: r.with_app as number },
    ],
    apps: apps.map((a) => ({
      clientId: a.id as string,
      name: a.name as string,
      productId: (a.product_id as string) ?? null,
      accounts: a.accounts as number,
      new30: a.new30 as number,
      active7: a.active7 as number,
    })),
    series: series.map((s) => ({ day: s.day as string, signups: s.signups as number, appLogins: s.app_logins as number })),
  }
}

/** Planos que podem ser escolhidos na troca (ativos) e códigos para o filtro. */
export async function planOptions(tx: Queryable) {
  const rows = await tx`select id, code, version, name, kind, status, billing_interval from zro.plans where status <> 'draft' order by code, version desc`
  // Mensal e anual têm o mesmo nome: o período entra no rótulo.
  const label = (p: (typeof rows)[number]) =>
    `${p.name as string}${p.billing_interval === 'year' ? ' · anual' : p.billing_interval === 'month' ? ' · mensal' : ''}`
  const active = rows
    .filter((p) => p.status === 'active')
    .map((p) => ({ id: p.id as string, code: p.code as string, version: p.version as number, name: label(p) }))
  const codes = [...new Map(rows.map((p) => [p.code as string, p.name as string])).entries()].map(([code, name]) => ({ code, name }))
  return { active, codes }
}

export type PersonDetail = {
  person: PersonRow
  subscriptions: (PersonPlan & { orgName: string; createdAt: Date; canceledAt: Date | null })[]
  entitlements: {
    id: string
    orgName: string
    productId: string
    productName: string
    source: string
    features: string[] | null
    limits: Record<string, number>
    startsAt: Date
    endsAt: Date | null
    reason: string | null
  }[]
  sessions: { id: string; userAgent: string | null; createdAt: Date; lastUsedAt: Date; expiresAt: Date; revokedAt: Date | null }[]
  identities: { provider: string; email: string; createdAt: Date; lastLoginAt: Date }[]
  timeline: { id: string; action: string; actorKind: string; actorName: string | null; orgName: string | null; reason: string | null; createdAt: Date }[]
}

/** Tudo da página da pessoa. null = conta não existe. */
export async function personDetail(tx: Queryable, userId: string): Promise<PersonDetail | null> {
  const [base] = await tx`select 1 from zro.users where id = ${userId}`
  if (!base) return null
  const [row] = await tx`
    select u.id, u.email, u.display_name, u.status, u.platform_role, u.email_verified_at, u.created_at,
      (select max(s.last_used_at) from zro.sessions s where s.user_id = u.id) as hub_last_seen,
      exists (select 1 from zro.external_identities x where x.user_id = u.id and x.provider = 'google') as google,
      coalesce((
        select json_agg(json_build_object('clientId', a.client_id, 'name', c.name, 'productId', a.product_id,
                 'firstLoginAt', a.first_login_at, 'lastLoginAt', a.last_login_at, 'logins', a.logins) order by a.last_login_at desc)
        from zro.app_accounts a join zro.oauth_clients c on c.id = a.client_id where a.user_id = u.id), '[]'::json) as apps,
      coalesce((
        select json_agg(json_build_object('orgId', o.id, 'name', o.name, 'role', m.role, 'status', o.status, 'plans', coalesce((
                 select json_agg(json_build_object('subscriptionId', s.id, 'planId', p.id, 'planName', p.name, 'planCode', p.code,
                          'version', p.version, 'kind', p.kind, 'provider', s.provider, 'status', s.status, 'periodEnd', s.current_period_end)
                        order by s.created_at desc)
                 from zro.subscriptions s join zro.plans p on p.id = s.plan_id
                 where s.org_id = o.id and s.status = any(${LIVE_SUB})), '[]'::json)) order by m.created_at)
        from zro.memberships m join zro.organizations o on o.id = m.org_id where m.user_id = u.id and m.status = 'active'), '[]'::json) as orgs
    from zro.users u where u.id = ${userId}`
  const person = toPerson(row!)
  const orgIds = person.orgs.map((o) => o.orgId)
  const subs = await tx`
    select s.id, s.plan_id, s.provider, s.status, s.current_period_end, s.created_at, s.canceled_at,
           p.name as plan_name, p.code, p.version, p.kind, o.name as org_name
    from zro.subscriptions s join zro.plans p on p.id = s.plan_id join zro.organizations o on o.id = s.org_id
    where s.org_id = any(${orgIds}::uuid[]) order by s.created_at desc limit 30`
  const ents = await tx`
    select e.id, e.product_id, pr.name as product_name, e.source, e.features, e.limits, e.starts_at, e.ends_at, e.reason, o.name as org_name
    from zro.entitlements e join zro.products pr on pr.id = e.product_id join zro.organizations o on o.id = e.org_id
    where e.org_id = any(${orgIds}::uuid[]) and e.status = 'active' and e.starts_at <= now() and (e.ends_at is null or e.ends_at > now())
    order by o.name, pr.step_order, e.source`
  const sessions = await tx`
    select id, user_agent, created_at, last_used_at, expires_at, revoked_at from zro.sessions
    where user_id = ${userId} order by last_used_at desc limit 10`
  const identities = await tx`
    select provider, email, created_at, last_login_at from zro.external_identities where user_id = ${userId} order by created_at`
  const timeline = await tx`
    select l.id::text as id, l.action, l.actor_kind, l.metadata->>'reason' as reason, l.created_at,
           coalesce(nullif(a.display_name, ''), a.email) as actor_name, o.name as org_name
    from zro.audit_logs l
    left join zro.users a on a.id = l.actor_user_id
    left join zro.organizations o on o.id = l.org_id
    where l.actor_user_id = ${userId} or (l.target_type = 'user' and l.target_id = ${userId}) or l.org_id = any(${orgIds}::uuid[])
    order by l.created_at desc, l.id desc limit 40`
  return {
    person,
    subscriptions: subs.map((s) => ({
      subscriptionId: s.id as string,
      planId: s.plan_id as string,
      planName: s.plan_name as string,
      planCode: s.code as string,
      version: s.version as number,
      kind: s.kind as string,
      provider: s.provider as string,
      status: s.status as string,
      periodEnd: (s.current_period_end as Date) ?? null,
      orgName: s.org_name as string,
      createdAt: s.created_at as Date,
      canceledAt: (s.canceled_at as Date) ?? null,
    })),
    entitlements: ents.map((e) => ({
      id: e.id as string,
      orgName: e.org_name as string,
      productId: e.product_id as string,
      productName: e.product_name as string,
      source: e.source as string,
      features: (e.features as string[]) ?? null,
      limits: (e.limits as Record<string, number>) ?? {},
      startsAt: e.starts_at as Date,
      endsAt: (e.ends_at as Date) ?? null,
      reason: (e.reason as string) ?? null,
    })),
    sessions: sessions.map((s) => ({
      id: s.id as string,
      userAgent: (s.user_agent as string) ?? null,
      createdAt: s.created_at as Date,
      lastUsedAt: s.last_used_at as Date,
      expiresAt: s.expires_at as Date,
      revokedAt: (s.revoked_at as Date) ?? null,
    })),
    identities: identities.map((i) => ({
      provider: i.provider as string,
      email: i.email as string,
      createdAt: i.created_at as Date,
      lastLoginAt: i.last_login_at as Date,
    })),
    timeline: timeline.map((t) => ({
      id: t.id as string,
      action: t.action as string,
      actorKind: t.actor_kind as string,
      actorName: (t.actor_name as string) ?? null,
      orgName: (t.org_name as string) ?? null,
      reason: (t.reason as string) ?? null,
      createdAt: t.created_at as Date,
    })),
  }
}

type Actor = { userId: string; reason: string }

/**
 * Suspende uma conta: ela para de entrar no HUB e nos apps. Encerra as sessões do HUB e os refresh tokens do login
 * único na mesma transação. Ninguém suspende a si mesmo nem outra pessoa da administração da plataforma.
 */
export async function suspendUser(tx: Queryable, actor: Actor, userId: string): Promise<{ sessions: number; refreshTokens: number }> {
  if (!actor.reason.trim()) throw new DomainError('invalid_input', 'Informe o motivo da suspensão.')
  if (actor.userId === userId) throw new DomainError('conflict', 'Você não pode suspender a própria conta.')
  const [u] = await tx`select id, status, platform_role from zro.users where id = ${userId} for update`
  if (!u) throw new DomainError('not_found', 'Conta não encontrada.')
  if (u.platform_role) throw new DomainError('conflict', 'Contas da administração da plataforma não podem ser suspensas aqui.')
  if (u.status !== 'active') throw new DomainError('conflict', 'Esta conta não está ativa.')
  await tx`update zro.users set status = 'suspended' where id = ${userId}`
  const s = await tx`update zro.sessions set revoked_at = now() where user_id = ${userId} and revoked_at is null returning id`
  const r = await tx`update zro.oauth_refresh_tokens set revoked_at = now() where user_id = ${userId} and revoked_at is null returning id`
  await audit(tx, {
    actorUserId: actor.userId,
    actorKind: 'admin',
    action: 'user.suspended',
    targetType: 'user',
    targetId: userId,
    metadata: { sessions: s.length, refreshTokens: r.length, reason: actor.reason },
  })
  return { sessions: s.length, refreshTokens: r.length }
}

/** Reativa uma conta suspensa. A pessoa entra de novo com a senha ou o Google; nada volta sozinho. */
export async function reactivateUser(tx: Queryable, actor: Actor, userId: string): Promise<void> {
  if (!actor.reason.trim()) throw new DomainError('invalid_input', 'Informe o motivo da reativação.')
  const [u] = await tx`update zro.users set status = 'active' where id = ${userId} and status = 'suspended' returning id`
  if (!u) throw new DomainError('conflict', 'Só contas suspensas podem ser reativadas.')
  await audit(tx, {
    actorUserId: actor.userId,
    actorKind: 'admin',
    action: 'user.reactivated',
    targetType: 'user',
    targetId: userId,
    metadata: { reason: actor.reason },
  })
}

const csvCell = (v: string) => {
  // Planilha não executa fórmula vinda de nome digitado pela pessoa.
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return `"${safe.replace(/"/g, '""')}"`
}

/** CSV da lista (só nome, e-mail, plano, apps e datas). BOM para o Excel abrir os acentos. */
export function peopleCsv(rows: PersonRow[]): string {
  const iso = (d: Date | null) => (d ? d.toISOString() : '')
  const head = ['nome', 'email', 'situacao', 'criada_em', 'ultimo_acesso_hub', 'ultimo_acesso', 'google', 'organizacoes', 'planos', 'apps']
  const lines = rows.map((p) =>
    [
      p.name,
      p.email,
      p.status === 'suspended' ? 'suspensa' : 'ativa',
      iso(p.createdAt),
      iso(p.hubLastSeenAt),
      iso(p.lastSeenAt),
      p.google ? 'sim' : 'nao',
      p.orgs.map((o) => o.name).join(' | '),
      p.orgs.map((o) => `${o.name}: ${o.plans.map((pl) => `${pl.planName} (${providerLabel(pl.provider)})`).join(', ') || 'sem plano'}`).join(' | '),
      p.apps.map((a) => `${a.name} (${a.lastLoginAt.toISOString()})`).join(' | '),
    ]
      .map((c) => csvCell(String(c)))
      .join(','),
  )
  return '﻿' + [head.join(','), ...lines].join('\r\n') + '\r\n'
}
