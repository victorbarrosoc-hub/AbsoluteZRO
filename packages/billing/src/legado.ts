/**
 * Contas antigas (de antes dos planos Zero/Órbita/Absoluto, migração 0055) continuam exatamente com o que têm. Um dia o
 * titular pode passá-las para o Zero: aqui fica esse caminho, DESLIGADO por padrão (platform_settings
 * 'migracao_legado'). Só a administração liga, e cada migração (uma a uma ou em lote) fica em audit_logs.
 * Migrar uma organização: encerra agora as assinaturas legado grátis e manuais, tira a marca de legado das
 * concessões (o app continua liberado, com o nível Zero), assina o Zero e recalcula. Assinatura de provedor (Stripe)
 * não muda aqui. Não dá o teste do Absoluto: a conta antiga já tinha acesso total.
 */
import type { Queryable } from '@zro/db'
import { audit, DomainError } from '@zro/observability'
import { recomputeEntitlements } from './entitlements'

type Actor = { userId: string; reason: string }

export async function migracaoLegadoLigada(tx: Queryable): Promise<boolean> {
  const [r] = await tx`select value from zro.platform_settings where key = 'migracao_legado'`
  return !!(r?.value as { ligada?: boolean } | undefined)?.ligada
}

export async function ligarMigracaoLegado(tx: Queryable, actor: Actor, ligada: boolean): Promise<void> {
  if (!actor.reason.trim()) throw new DomainError('invalid_input', 'Informe o motivo (fica na auditoria).')
  await tx`insert into zro.platform_settings (key, value, updated_by) values ('migracao_legado', ${tx.json({ ligada, em: new Date().toISOString() })}, ${actor.userId})
           on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`
  await audit(tx, {
    orgId: null,
    actorUserId: actor.userId,
    actorKind: 'admin',
    action: ligada ? 'billing.migracao_legado_ligada' : 'billing.migracao_legado_desligada',
    targetType: 'platform',
    targetId: 'migracao_legado',
    metadata: { reason: actor.reason },
  })
}

/** Organizações que ainda têm algo legado valendo. */
export async function contarLegado(tx: Queryable): Promise<number> {
  const [r] = await tx`
    select count(distinct e.org_id)::int as n from zro.entitlements e join zro.organizations o on o.id = e.org_id
    where e.status = 'active' and e.legado and o.status = 'active' and (e.ends_at is null or e.ends_at > now())`
  return Number(r?.n ?? 0)
}

export async function migrarParaZero(tx: Queryable, actor: Actor, orgId: string, now = new Date()): Promise<boolean> {
  if (!actor.reason.trim()) throw new DomainError('invalid_input', 'Informe o motivo (fica na auditoria).')
  if (!(await migracaoLegadoLigada(tx))) throw new DomainError('conflict', 'A migração das contas antigas está desligada.')
  const [org] = await tx`select id from zro.organizations where id = ${orgId} for update`
  if (!org) throw new DomainError('not_found', 'Organização não encontrada.')
  const [zero] = await tx`select id from zro.plans where code = 'zero' and status = 'active' order by version desc limit 1`
  if (!zero) throw new DomainError('conflict', 'O plano Zero não está ativo.')
  const subs = await tx`
    update zro.subscriptions s set status = 'canceled', cancel_at_period_end = false, canceled_at = ${now},
           current_period_end = least(coalesce(s.current_period_end, ${now}), ${now})
    from zro.plans p
    where p.id = s.plan_id and p.legado and s.org_id = ${orgId} and s.provider in ('free', 'manual', 'trial')
      and s.status in ('active', 'trialing', 'past_due')
    returning s.id`
  const grants = await tx`update zro.entitlements set legado = false, nivel = null
                          where org_id = ${orgId} and source = 'admin_grant' and status = 'active' and legado returning id`
  if (!subs.length && !grants.length) return false
  const [temZero] = await tx`select 1 from zro.subscriptions s join zro.plans p on p.id = s.plan_id
                             where s.org_id = ${orgId} and p.code = 'zero' and s.status = 'active'`
  if (!temZero) {
    await tx`insert into zro.subscriptions (org_id, plan_id, status, current_period_start, provider, provider_subscription_id, provider_updated_at)
             values (${orgId}, ${zero.id as string}, 'active', ${now}, 'free', ${'zero-' + orgId}, ${now})
             on conflict (provider, provider_subscription_id) do update set status = 'active', current_period_end = null, canceled_at = null`
  }
  await recomputeEntitlements(tx, orgId, now)
  await audit(tx, {
    orgId,
    actorUserId: actor.userId,
    actorKind: 'admin',
    action: 'billing.migrado_para_zero',
    targetType: 'organization',
    targetId: orgId,
    metadata: { assinaturas: subs.length, concessoes: grants.length, reason: actor.reason },
  })
  return true
}

/** Em lote: todas as organizações com algo legado (até `limite` por vez). */
export async function migrarTodasParaZero(tx: Queryable, actor: Actor, limite = 500): Promise<number> {
  if (!(await migracaoLegadoLigada(tx))) throw new DomainError('conflict', 'A migração das contas antigas está desligada.')
  const orgs = await tx`
    select distinct e.org_id from zro.entitlements e join zro.organizations o on o.id = e.org_id
    where e.status = 'active' and e.legado and o.status = 'active' limit ${limite}`
  let n = 0
  for (const o of orgs) if (await migrarParaZero(tx, actor, o.org_id as string)) n++
  return n
}
