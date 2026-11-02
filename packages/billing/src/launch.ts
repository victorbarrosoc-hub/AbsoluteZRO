/**
 * Ligar as vendas (decisão do titular em 26/10/2026), aposentado pela 0055: `salesStatus` segue lendo o registro
 * antigo (se algum dia foi ligado), e `launchSales` recusa.
 */
import type { Queryable } from '@zro/db'
import { DomainError } from '@zro/observability'

export type SalesStatus = { launched: false } | { launched: true; at: string; cutoff: string; trialDays: number }

export async function salesStatus(tx: Queryable): Promise<SalesStatus> {
  const [row] = await tx`select value from zro.platform_settings where key = 'sales_launched'`
  if (!row) return { launched: false }
  const v = row.value as { at: string; cutoff: string; trial_days: number }
  return { launched: true, at: v.at, cutoff: v.cutoff, trialDays: v.trial_days }
}

/**
 * Substituído pelos planos Zero/Órbita/Absoluto e pela campanha do teste (migração 0055, ADR 0039): o fluxo antigo
 * punha conta nova na "Conta Absolute ZRO" sem ferramentas e dava teste do Completo, que saiu da venda. A venda online
 * volta com o Stripe, numa etapa própria.
 */
export async function launchSales(
  _tx: Queryable,
  _actor: { userId: string; reason: string },
  _input: { cutoff: Date; trialDays: number; trialPlanCode?: string; trialAiCredits?: number },
): Promise<{ grandfathered: number }> {
  throw new DomainError('conflict', 'Ligar vendas saiu: os planos agora são Zero, Órbita e Absoluto, e o teste é a campanha do console.')
}
