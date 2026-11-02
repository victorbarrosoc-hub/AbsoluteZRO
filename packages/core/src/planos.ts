/**
 * Planos Zero/Órbita/Absoluto no HUB (ADR 0039): o teste do Absoluto nos gatilhos da conta, os limites da pessoa e a
 * edição do catálogo de limites pelo console.
 */
import type { Authenticated } from '@zro/auth'
import { atualizarLimitePlano, iniciarTeste, limitesDaPessoa, type Nivel, type ResultadoTeste } from '@zro/billing'
import type { Database } from '@zro/db'
import { audit, createLogger, DomainError } from '@zro/observability'
import { requireUser } from './authz'

const log = createLogger('planos')

/**
 * Gatilho do teste (criar organização, confirmar e-mail). Nunca derruba quem chamou: sem campanha, sem e-mail ou com
 * qualquer trava, só não começa.
 */
export async function talvezIniciarTeste(
  db: Database,
  input: { userId: string; orgId?: string | null; ipHash?: string | null },
): Promise<ResultadoTeste | null> {
  try {
    return await db.asSystem('planos: teste do Absoluto', (tx) => iniciarTeste(tx, { ...input, origem: 'conta_nova' }))
  } catch (e) {
    log.warn('teste.nao_iniciado', { error: e })
    return null
  }
}

/** O hash do IP da sessão do HUB (o mesmo que a sessão guardou ao entrar). */
export async function ipDaSessao(db: Database, auth: Authenticated): Promise<string | null> {
  if (auth.session.id.startsWith('oauth:')) return null
  const [r] = await db.asSystem('planos: ip da sessão', (tx) => tx`select ip_hash from zro.sessions where id = ${auth.session.id}`)
  return (r?.ip_hash as string) ?? null
}

/** GET /api/v1/me/limites: nível e limites efetivos da pessoa na organização ativa (ou do token do app). */
export async function meusLimites(db: Database, auth: Authenticated | null) {
  const { userId } = requireUser(auth)
  return db.asSystem('planos: limites da pessoa', (tx) => limitesDaPessoa(tx, userId, auth!.session.activeOrgId))
}

/** Console › Planos: muda um número do catálogo. Só o papel admin (o RLS confere de novo) e com motivo na auditoria. */
export async function atualizarLimite(
  db: Database,
  auth: Authenticated | null,
  input: { nivel: Nivel; productId: string; chave: string; valor: number | null; reason: string },
): Promise<void> {
  const { userId } = requireUser(auth, { verifiedEmail: true })
  if (auth!.user.platformRole !== 'admin') throw new DomainError('platform_role_required', 'Só a administração muda os limites.')
  if (!input.reason.trim()) throw new DomainError('invalid_input', 'Informe o motivo (fica na auditoria).')
  const { antes } = await db.asUser({ userId, orgId: null }, (tx) => atualizarLimitePlano(tx, userId, input))
  await db.asSystem('planos: auditoria do limite', (tx) =>
    audit(tx, {
      orgId: null,
      actorUserId: userId,
      actorKind: 'admin',
      action: 'catalog.plan_limit_updated',
      targetType: 'plan_limit',
      targetId: `${input.nivel}:${input.productId}:${input.chave}`,
      metadata: { antes, depois: input.valor, reason: input.reason },
    }),
  )
}
