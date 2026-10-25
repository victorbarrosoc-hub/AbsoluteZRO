/**
 * Quotas e consumo (PRD §5.1): contabilização atômica e idempotente.
 * - Trava por organização+métrica (advisory lock na transação), como as cotas do NOSSOM.
 * - A mesma idempotency_key nunca conta duas vezes.
 * - O limite vem dos entitlements vigentes (maior limite entre as fontes). Sem limite configurado para a métrica,
 *   a operação medida fica bloqueada: nada é "ilimitado" por omissão (PRD §9.1).
 * - Período: mês civil em UTC (decisão reversível, docs/decisions/0005-quotas.md).
 */
import type { Queryable } from '@zro/db'

export function quotaPeriod(now = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { start, end }
}

export type QuotaResult =
  | { ok: true; used: number; limit: number; periodEnd: Date; duplicate: boolean }
  | { ok: false; code: 'quota_not_configured' | 'quota_exceeded'; used: number; limit: number | null; periodEnd: Date; message: string }

async function currentLimit(tx: Queryable, orgId: string, metric: string, now: Date): Promise<number | null> {
  const [r] = await tx`
    select max((e.limits ->> ${metric})::bigint)::bigint as lim from zro.entitlements e
    where e.org_id = ${orgId} and e.status = 'active' and e.starts_at <= ${now} and (e.ends_at is null or e.ends_at > ${now})
      and e.limits ? ${metric}`
  return r?.lim == null ? null : Number(r.lim)
}

/** Confere sem consumir (usada na etapa "quota disponível" da autorização). */
export async function peekQuota(tx: Queryable, orgId: string, metric: string, amount = 1, now = new Date()): Promise<QuotaResult> {
  const { start, end } = quotaPeriod(now)
  const limit = await currentLimit(tx, orgId, metric, now)
  const [q] = await tx`select used from zro.quotas where org_id = ${orgId} and metric = ${metric} and period_start = ${start}`
  const used = q ? Number(q.used) : 0
  if (limit === null) return { ok: false, code: 'quota_not_configured', used, limit, periodEnd: end, message: 'O limite desta operação ainda não foi configurado no plano.' }
  if (used + amount > limit) return { ok: false, code: 'quota_exceeded', used, limit, periodEnd: end, message: 'O limite do plano para este mês foi atingido.' }
  return { ok: true, used, limit, periodEnd: end, duplicate: false }
}

export async function consumeQuota(
  tx: Queryable,
  input: { orgId: string; metric: string; amount?: number; idempotencyKey: string; userId?: string | null; projectId?: string | null; workflowRunId?: string | null },
  now = new Date(),
): Promise<QuotaResult> {
  const amount = input.amount ?? 1
  const { start, end } = quotaPeriod(now)
  await tx`select pg_advisory_xact_lock(hashtextextended(${`quota:${input.orgId}:${input.metric}`}, 0))`
  const [dup] = await tx`select period_start from zro.usage_events where org_id = ${input.orgId} and idempotency_key = ${input.idempotencyKey}`
  if (dup) {
    const [q] = await tx`select used, limit_value from zro.quotas where org_id = ${input.orgId} and metric = ${input.metric} and period_start = ${dup.period_start as Date}`
    return { ok: true, used: Number(q?.used ?? 0), limit: Number(q?.limit_value ?? 0), periodEnd: end, duplicate: true }
  }
  const limit = await currentLimit(tx, input.orgId, input.metric, now)
  const [q] = await tx`
    insert into zro.quotas (org_id, metric, period_start, period_end, limit_value)
    values (${input.orgId}, ${input.metric}, ${start}, ${end}, ${limit})
    on conflict (org_id, metric, period_start) do update set limit_value = excluded.limit_value, updated_at = now()
    returning used`
  const used = Number(q!.used)
  if (limit === null) return { ok: false, code: 'quota_not_configured', used, limit, periodEnd: end, message: 'O limite desta operação ainda não foi configurado no plano.' }
  if (used + amount > limit) return { ok: false, code: 'quota_exceeded', used, limit, periodEnd: end, message: 'O limite do plano para este mês foi atingido.' }
  await tx`
    insert into zro.usage_events (org_id, user_id, metric, amount, idempotency_key, project_id, workflow_run_id, period_start)
    values (${input.orgId}, ${input.userId ?? null}, ${input.metric}, ${amount}, ${input.idempotencyKey}, ${input.projectId ?? null}, ${input.workflowRunId ?? null}, ${start})`
  await tx`update zro.quotas set used = used + ${amount}, updated_at = now() where org_id = ${input.orgId} and metric = ${input.metric} and period_start = ${start}`
  return { ok: true, used: used + amount, limit, periodEnd: end, duplicate: false }
}
