/**
 * Visão geral do console da plataforma (/admin). Quem chama já passou por requirePlatformAdmin; roda como sistema.
 * Só números que o HUB registra de verdade: contas, assinaturas, contas por app, créditos de IA gastos
 * (zro.usage_events, métrica zro.ai_credits) e arquivos catalogados nos projetos (zro.project_assets).
 */
import type { Queryable } from '@zro/db'
import { onlineNow, segmentCounts, type PeopleSegment } from './people'

const TZ = 'America/Fortaleza'
const LIVE_SUB = ['active', 'trialing', 'past_due']

export type ConsoleOverview = {
  online: { total: number; hub: number; apps: number }
  accounts: number
  new7: number
  new30: number
  active7: number
  segments: Record<PeopleSegment | 'todas', number>
  /** Pessoas por plano vivo (mensal e anual juntos, pelo nome). */
  plans: { name: string; kind: string; people: number }[]
  /** Pessoas que já entraram em algum app de cada produto, e quantas nos últimos 7 dias. */
  products: { id: string; name: string; people: number; active7: number }[]
  /** Últimos 30 dias (fuso de Fortaleza), do mais antigo a hoje. */
  series: { day: string; signups: number; aiCredits: number }[]
  ai: { credits30: number; people30: number }
  files: { count: number; bytes: number }
  attention: { planRequests: number; stuckRuns: number; billingFailed: number }
}

export async function consoleOverview(tx: Queryable): Promise<ConsoleOverview> {
  const [n] = await tx`
    select count(*)::int as accounts,
      count(*) filter (where u.created_at > now() - interval '7 days')::int as new7,
      count(*) filter (where u.created_at > now() - interval '30 days')::int as new30,
      count(*) filter (where exists (select 1 from zro.sessions s where s.user_id = u.id and s.last_used_at > now() - interval '7 days')
                          or exists (select 1 from zro.app_accounts a where a.user_id = u.id and a.last_login_at > now() - interval '7 days'))::int as active7
    from zro.users u where u.status <> 'deleted'`
  const plans = await tx`
    select p.name, p.kind, count(distinct m.user_id)::int as people
    from zro.memberships m
    join zro.users u on u.id = m.user_id and u.status <> 'deleted'
    join zro.subscriptions s on s.org_id = m.org_id and s.status = any(${LIVE_SUB})
    join zro.plans p on p.id = s.plan_id
    where m.status = 'active'
    group by p.name, p.kind
    order by people desc, p.name`
  const products = await tx`
    select pr.id, pr.name,
      count(distinct a.user_id)::int as people,
      count(distinct a.user_id) filter (where a.last_login_at > now() - interval '7 days')::int as active7
    from zro.products pr left join zro.app_accounts a on a.product_id = pr.id
    group by pr.id, pr.name, pr.step_order
    order by pr.step_order`
  const series = await tx`
    with d as (
      select generate_series((now() at time zone ${TZ})::date - 29, (now() at time zone ${TZ})::date, interval '1 day')::date as day
    ), s as (
      select (created_at at time zone ${TZ})::date as day, count(*)::int as n from zro.users
      where status <> 'deleted' and created_at > now() - interval '31 days' group by 1
    ), ai as (
      select (created_at at time zone ${TZ})::date as day, sum(amount)::int as n from zro.usage_events
      where metric = 'zro.ai_credits' and created_at > now() - interval '31 days' group by 1
    )
    select to_char(d.day, 'YYYY-MM-DD') as day, coalesce(s.n, 0)::int as signups, coalesce(ai.n, 0)::int as ai
    from d left join s on s.day = d.day left join ai on ai.day = d.day order by d.day`
  const [ai] = await tx`
    select coalesce(sum(amount), 0)::int as credits, count(distinct user_id)::int as people from zro.usage_events
    where metric = 'zro.ai_credits' and created_at > now() - interval '30 days'`
  const [files] = await tx`select count(*)::int as n, coalesce(sum(size_bytes), 0)::float8 as bytes from zro.project_assets`
  const [att] = await tx`
    select (select count(*)::int from zro.plan_requests where status = 'open') as requests,
           (select count(*)::int from zro.workflow_runs where status in ('dead_letter', 'requires_review', 'failed')) as stuck,
           (select count(*)::int from zro.billing_events where status = 'failed' and received_at > now() - interval '30 days') as billing`
  return {
    online: await onlineNow(tx),
    accounts: n!.accounts as number,
    new7: n!.new7 as number,
    new30: n!.new30 as number,
    active7: n!.active7 as number,
    segments: await segmentCounts(tx),
    plans: plans.map((p) => ({ name: p.name as string, kind: p.kind as string, people: p.people as number })),
    products: products.map((p) => ({ id: p.id as string, name: p.name as string, people: p.people as number, active7: p.active7 as number })),
    series: series.map((s) => ({ day: s.day as string, signups: s.signups as number, aiCredits: s.ai as number })),
    ai: { credits30: ai!.credits as number, people30: ai!.people as number },
    files: { count: files!.n as number, bytes: Number(files!.bytes) },
    attention: { planRequests: att!.requests as number, stuckRuns: att!.stuck as number, billingFailed: att!.billing as number },
  }
}
