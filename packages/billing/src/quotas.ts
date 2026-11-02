/**
 * Quotas e consumo (PRD §5.1): contabilização atômica e idempotente.
 * - Trava por organização+métrica (advisory lock na transação), como as cotas do NOSSOM.
 * - A mesma idempotency_key nunca conta duas vezes.
 * - O limite vem dos entitlements vigentes (maior limite entre as fontes). Sem limite configurado para a métrica,
 *   a operação medida fica bloqueada: nada é "ilimitado" por omissão (PRD §9.1).
 * - Período: mês civil em UTC (decisão reversível, docs/decisions/0005-quotas.md). Entitlement com
 *   `limite_no_periodo` (teste do Absoluto, 0055) conta a janela inteira dele: o que já foi gasto em meses anteriores
 *   da janela sai do limite deste mês.
 * - Recarga (só as métricas de RECARGA_METRICAS, hoje a Z): acabou a franquia do mês, gasta da recarga que vence
 *   antes. A franquia vem sempre primeiro.
 */
import type { Queryable } from '@zro/db'

export function quotaPeriod(now = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { start, end }
}

/** Métricas que aceitam recarga (zro.z_recargas). Uma mensagem da Z = 1 unidade de zro.ai_credits. */
export const RECARGA_METRICAS = ['zro.ai_credits'] as const
const aceitaRecarga = (metric: string) => (RECARGA_METRICAS as readonly string[]).includes(metric)

export type QuotaResult =
  | {
      ok: true
      used: number
      limit: number
      periodEnd: Date
      duplicate: boolean
      /** De onde saiu o consumo: a franquia do mês ou uma recarga. */
      fonte?: 'franquia' | 'recarga'
      /** Saldo de recarga válido (só nas métricas com recarga). */
      recarga?: number
    }
  | {
      ok: false
      code: 'quota_not_configured' | 'quota_exceeded'
      used: number
      limit: number | null
      periodEnd: Date
      message: string
      recarga?: number
    }

async function currentLimit(tx: Queryable, orgId: string, metric: string, now: Date): Promise<number | null> {
  const { start } = quotaPeriod(now)
  const [r] = await tx`
    select max(greatest(0, (e.limits ->> ${metric})::bigint - case when e.limite_no_periodo then coalesce((
             select sum(u.amount) from zro.usage_events u
             where u.org_id = e.org_id and u.metric = ${metric} and u.recarga_id is null
               and u.created_at >= e.starts_at and u.period_start < ${start}), 0) else 0 end))::bigint as lim
    from zro.entitlements e
    where e.org_id = ${orgId} and e.status = 'active' and e.starts_at <= ${now} and (e.ends_at is null or e.ends_at > ${now})
      and e.limits ? ${metric}`
  return r?.lim == null ? null : Number(r.lim)
}

/** Saldo de recarga válido agora (soma do que falta em cada recarga não vencida). */
export async function saldoRecarga(tx: Queryable, orgId: string, now = new Date()): Promise<number> {
  const [r] = await tx`select coalesce(sum(mensagens - usadas), 0)::int as n from zro.z_recargas where org_id = ${orgId} and expira_em > ${now}`
  return Number(r?.n ?? 0)
}

/** Confere sem consumir (usada na etapa "quota disponível" da autorização). */
export async function peekQuota(tx: Queryable, orgId: string, metric: string, amount = 1, now = new Date()): Promise<QuotaResult> {
  const { start, end } = quotaPeriod(now)
  const limit = await currentLimit(tx, orgId, metric, now)
  const [q] = await tx`select used from zro.quotas where org_id = ${orgId} and metric = ${metric} and period_start = ${start}`
  const used = q ? Number(q.used) : 0
  const recarga = aceitaRecarga(metric) ? await saldoRecarga(tx, orgId, now) : undefined
  if (limit === null)
    return {
      ok: false,
      code: 'quota_not_configured',
      used,
      limit,
      periodEnd: end,
      message: 'O limite desta operação ainda não foi configurado no plano.',
      recarga,
    }
  if (used + amount > limit) {
    if (recarga !== undefined && amount > 0 && (await recargaPara(tx, orgId, amount, now, false))) {
      return { ok: true, used, limit, periodEnd: end, duplicate: false, fonte: 'recarga', recarga }
    }
    return { ok: false, code: 'quota_exceeded', used, limit, periodEnd: end, message: 'O limite do plano para este mês foi atingido.', recarga }
  }
  return { ok: true, used, limit, periodEnd: end, duplicate: false, fonte: 'franquia', recarga }
}

/** A recarga que paga `amount` inteiro: a que vence antes (e, empatada, a mais antiga). */
async function recargaPara(tx: Queryable, orgId: string, amount: number, now: Date, travar: boolean): Promise<string | null> {
  const [r] = travar
    ? await tx`select id from zro.z_recargas where org_id = ${orgId} and expira_em > ${now} and mensagens - usadas >= ${amount}
               order by expira_em, criado_em limit 1 for update`
    : await tx`select id from zro.z_recargas where org_id = ${orgId} and expira_em > ${now} and mensagens - usadas >= ${amount}
               order by expira_em, criado_em limit 1`
  return (r?.id as string) ?? null
}

export async function consumeQuota(
  tx: Queryable,
  input: {
    orgId: string
    metric: string
    amount?: number
    idempotencyKey: string
    userId?: string | null
    projectId?: string | null
    workflowRunId?: string | null
  },
  now = new Date(),
): Promise<QuotaResult> {
  const amount = input.amount ?? 1
  const { start, end } = quotaPeriod(now)
  await tx`select pg_advisory_xact_lock(hashtextextended(${`quota:${input.orgId}:${input.metric}`}, 0))`
  const [dup] = await tx`select period_start, recarga_id from zro.usage_events where org_id = ${input.orgId} and idempotency_key = ${input.idempotencyKey}`
  if (dup) {
    const [q] =
      await tx`select used, limit_value from zro.quotas where org_id = ${input.orgId} and metric = ${input.metric} and period_start = ${dup.period_start as Date}`
    return {
      ok: true,
      used: Number(q?.used ?? 0),
      limit: Number(q?.limit_value ?? 0),
      periodEnd: end,
      duplicate: true,
      fonte: dup.recarga_id ? 'recarga' : 'franquia',
    }
  }
  const limit = await currentLimit(tx, input.orgId, input.metric, now)
  const [q] = await tx`
    insert into zro.quotas (org_id, metric, period_start, period_end, limit_value)
    values (${input.orgId}, ${input.metric}, ${start}, ${end}, ${limit})
    on conflict (org_id, metric, period_start) do update set limit_value = excluded.limit_value, updated_at = now()
    returning used`
  const used = Number(q!.used)
  if (limit === null)
    return { ok: false, code: 'quota_not_configured', used, limit, periodEnd: end, message: 'O limite desta operação ainda não foi configurado no plano.' }
  if (used + amount > limit) {
    // Franquia do mês acabou: a recarga paga (inteira numa recarga só), sem mexer no contador do mês.
    const recargaId = aceitaRecarga(input.metric) ? await recargaPara(tx, input.orgId, amount, now, true) : null
    if (!recargaId) {
      const recarga = aceitaRecarga(input.metric) ? await saldoRecarga(tx, input.orgId, now) : undefined
      return { ok: false, code: 'quota_exceeded', used, limit, periodEnd: end, message: 'O limite do plano para este mês foi atingido.', recarga }
    }
    await tx`update zro.z_recargas set usadas = usadas + ${amount} where id = ${recargaId}`
    await tx`
      insert into zro.usage_events (org_id, user_id, metric, amount, idempotency_key, project_id, workflow_run_id, period_start, recarga_id)
      values (${input.orgId}, ${input.userId ?? null}, ${input.metric}, ${amount}, ${input.idempotencyKey}, ${input.projectId ?? null}, ${input.workflowRunId ?? null}, ${start}, ${recargaId})`
    return { ok: true, used, limit, periodEnd: end, duplicate: false, fonte: 'recarga', recarga: await saldoRecarga(tx, input.orgId, now) }
  }
  await tx`
    insert into zro.usage_events (org_id, user_id, metric, amount, idempotency_key, project_id, workflow_run_id, period_start)
    values (${input.orgId}, ${input.userId ?? null}, ${input.metric}, ${amount}, ${input.idempotencyKey}, ${input.projectId ?? null}, ${input.workflowRunId ?? null}, ${start})`
  await tx`update zro.quotas set used = used + ${amount}, updated_at = now() where org_id = ${input.orgId} and metric = ${input.metric} and period_start = ${start}`
  return { ok: true, used: used + amount, limit, periodEnd: end, duplicate: false, fonte: 'franquia' }
}
