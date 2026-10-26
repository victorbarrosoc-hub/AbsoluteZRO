/**
 * Ligar as vendas (decisão do titular em 26/10/2026). Uma vez, pelo console, por admin de plataforma:
 * - conta nova passa a receber só a conta grátis (sem ferramentas) e o teste do Completo por `trialDays` dias;
 * - contas que já existiam seguem com as ferramentas grátis até `cutoff` e depois precisam assinar.
 * Idempotente: chamar de novo só atualiza o teste; a data de corte já gravada nas assinaturas não muda.
 */
import type { Queryable } from '@zro/db'
import { audit, DomainError } from '@zro/observability'
import { recomputeEntitlements } from './entitlements'

export type SalesStatus = { launched: false } | { launched: true; at: string; cutoff: string; trialDays: number }

export async function salesStatus(tx: Queryable): Promise<SalesStatus> {
  const [row] = await tx`select value from zro.platform_settings where key = 'sales_launched'`
  if (!row) return { launched: false }
  const v = row.value as { at: string; cutoff: string; trial_days: number }
  return { launched: true, at: v.at, cutoff: v.cutoff, trialDays: v.trial_days }
}

export async function launchSales(
  tx: Queryable,
  actor: { userId: string; reason: string },
  input: { cutoff: Date; trialDays: number; trialPlanCode?: string; trialAiCredits?: number },
  now = new Date(),
): Promise<{ grandfathered: number }> {
  if (!actor.reason.trim()) throw new DomainError('invalid_input', 'Informe o motivo (fica na auditoria).')
  if (!(input.cutoff > now)) throw new DomainError('invalid_input', 'A data de corte precisa ser no futuro.')
  if (!Number.isInteger(input.trialDays) || input.trialDays < 0 || input.trialDays > 30) {
    throw new DomainError('invalid_input', 'Teste entre 0 e 30 dias.')
  }
  const trialPlan = input.trialPlanCode ?? 'ciclo-do-o'
  const [plan] = await tx`select id from zro.plans where code = ${trialPlan} and status = 'active' order by version desc limit 1`
  if (!plan) throw new DomainError('invalid_input', 'Plano do teste não está ativo.')
  const [free] = await tx`select id from zro.plans where code = 'conta-absolute-zro' and version = 3`
  if (!free) throw new DomainError('conflict', 'Conta grátis sem ferramentas não encontrada (migração 0011).')

  const already = await salesStatus(tx)
  await tx`insert into zro.platform_settings (key, value, updated_by) values ('signup_trial', ${tx.json({ days: input.trialDays, plan_code: trialPlan, ai_credits: input.trialAiCredits ?? 50 })}, ${actor.userId})
           on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`

  let orgs: string[] = []
  if (!already.launched) {
    await tx`update zro.plans set status = 'active' where id = ${free.id as string}`
    await tx`update zro.plans set status = 'retired' where code = 'conta-absolute-zro' and version < 3 and status = 'active'`
    // Assinaturas grátis antigas (com ferramentas) ganham a data de corte.
    const rows = await tx`
      update zro.subscriptions s set current_period_end = ${input.cutoff}
      from zro.plans p
      where p.id = s.plan_id and p.code = 'conta-absolute-zro' and p.version < 3 and s.provider = 'free'
        and s.status = 'active' and s.current_period_end is null
      returning s.org_id`
    orgs = [...new Set(rows.map((r) => r.org_id as string))]
    for (const org of orgs) await recomputeEntitlements(tx, org, now)
    await tx`insert into zro.platform_settings (key, value, updated_by)
             values ('sales_launched', ${tx.json({ at: now.toISOString(), cutoff: input.cutoff.toISOString(), trial_days: input.trialDays })}, ${actor.userId})`
  }
  await audit(tx, {
    orgId: null,
    actorUserId: actor.userId,
    actorKind: 'admin',
    action: already.launched ? 'billing.trial_updated' : 'billing.sales_launched',
    targetType: 'platform',
    targetId: 'sales',
    metadata: { cutoff: input.cutoff.toISOString(), trialDays: input.trialDays, trialPlan, grandfathered: orgs.length, reason: actor.reason },
  })
  return { grandfathered: orgs.length }
}
