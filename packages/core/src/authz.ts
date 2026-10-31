/**
 * Autorização no servidor, em toda operação relevante, na ordem do PRD §5.2:
 * identidade → organização ativa → vínculo e papel → acesso ao projeto → entitlement → feature → quota →
 * autorização sobre recurso externo. Nada vem do cliente: organização e papel saem da sessão e do banco.
 * A interface esconde botões, mas é aqui (e no RLS) que o acesso é negado.
 */
import type { Authenticated } from '@zro/auth'
import { checkEntitlement, peekQuota, RELEASE_CLOSED_MESSAGE, releaseAllows, type ReleaseChannel } from '@zro/billing'
import type { Database } from '@zro/db'
import { DomainError } from '@zro/observability'

export type OrgRole = 'owner' | 'admin' | 'manager' | 'editor' | 'viewer' | 'billing' | 'guest'
export const EDIT_ROLES: OrgRole[] = ['owner', 'admin', 'manager', 'editor']
export const ADMIN_ROLES: OrgRole[] = ['owner', 'admin']

export type Need = {
  /** default true: a operação acontece dentro da organização ativa. */
  org?: boolean
  verifiedEmail?: boolean
  roles?: OrgRole[]
  project?: { id: string; access: 'view' | 'edit' }
  /** Produto da operação: gate de lançamento (ADR 0023) + entitlement + feature. O canal padrão é o do pedido. */
  product?: { id: string; feature?: string | null; channel?: ReleaseChannel }
  /** Só o gate de lançamento, sem exigir o produto no plano (a Z chamada de dentro de um app). */
  release?: { productId: string; channel?: ReleaseChannel }
  quota?: { metric: string; amount?: number }
  external?: (actor: Actor) => Promise<boolean>
}

/** Produto fechado por lançamento para esta pessoa: 403 com `closed`, e nunca "contrate" (upgrade não resolve). */
export const productClosedError = (productId: string) =>
  new DomainError('product_closed', RELEASE_CLOSED_MESSAGE, { product: productId, closed: true, upgrade: false })

/** Por onde a pessoa chegou: token de um app da família = api; sessão do HUB = web. */
export const channelOf = (auth: Authenticated): ReleaseChannel => (auth.session.app ? 'api' : 'web')

export type Actor = {
  auth: Authenticated
  userId: string
  orgId: string
  role: OrgRole
  entitlementId: string | null
}

export type UserActor = { auth: Authenticated; userId: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function requireUser(auth: Authenticated | null, opts: { verifiedEmail?: boolean } = {}): UserActor {
  if (!auth) throw new DomainError('unauthenticated', 'Entre na sua conta para continuar.')
  if (opts.verifiedEmail && !auth.user.emailVerified) throw new DomainError('email_not_verified', 'Confirme seu e-mail para continuar.')
  return { auth, userId: auth.user.id }
}

export async function authorize(db: Database, auth: Authenticated | null, need: Need = {}): Promise<Actor> {
  // 1. identidade
  const { userId } = requireUser(auth, { verifiedEmail: need.verifiedEmail })
  const a = auth!
  // 2. organização ativa
  const orgId = a.session.activeOrgId
  if (!orgId) throw new DomainError('no_active_organization', 'Escolha ou crie uma organização para continuar.')
  // 3. vínculo e papel
  const [m] = await db.asSystem(
    'authz: vínculo',
    (tx) => tx`
    select m.role, o.status as org_status from zro.memberships m join zro.organizations o on o.id = m.org_id
    where m.org_id = ${orgId} and m.user_id = ${userId} and m.status = 'active'`,
  )
  if (!m) throw new DomainError('forbidden_role', 'Você não faz parte desta organização.')
  if (m.org_status !== 'active') throw new DomainError('organization_inactive', 'Esta organização está suspensa.')
  const role = m.role as OrgRole
  if (need.roles && !need.roles.includes(role)) throw new DomainError('forbidden_role', 'Seu papel nesta organização não permite esta ação.')
  // 4. acesso ao projeto (pelo RLS, com o papel restrito)
  if (need.project) {
    if (!UUID.test(need.project.id)) throw new DomainError('project_not_found', 'Projeto não encontrado.')
    const [p] = await db.asUser(
      { userId, orgId },
      (tx) => tx`select zro.can_view_project(${need.project!.id}) as view, zro.can_edit_project(${need.project!.id}) as edit`,
    )
    if (!p?.view) throw new DomainError('project_not_found', 'Projeto não encontrado.')
    if (need.project.access === 'edit' && !p.edit) throw new DomainError('project_read_only', 'Você pode ver este projeto, mas não alterar.')
  }
  // 5a. gate de lançamento (ADR 0023): produto fechado só abre para quem está na lista, no canal do pedido.
  const channel = channelOf(a)
  if (need.release) {
    const ok = await db.asSystem('authz: lançamento', (tx) => releaseAllows(tx, need.release!.productId, userId, need.release!.channel ?? channel))
    if (!ok) throw productClosedError(need.release.productId)
  }
  // 5 e 6. entitlement e feature (o gate vem antes, dentro de checkEntitlement)
  let entitlementId: string | null = null
  if (need.product) {
    const check = await db.asSystem('authz: entitlement', (tx) =>
      checkEntitlement(tx, orgId, need.product!.id, need.product!.feature ?? null, { who: { userId, channel: need.product!.channel ?? channel } }),
    )
    if (!check.ok) {
      if (check.code === 'product_closed') throw productClosedError(need.product.id)
      throw new DomainError(check.code, check.message, { product: need.product.id, upgrade: check.code !== 'product_unavailable' })
    }
    entitlementId = check.entitlementId
  }
  // 7. quota disponível (o consumo acontece na execução, de forma atômica e idempotente)
  if (need.quota) {
    const q = await db.asSystem('authz: quota', (tx) => peekQuota(tx, orgId, need.quota!.metric, need.quota!.amount ?? 1))
    if (!q.ok) throw new DomainError(q.code, q.message, { metric: need.quota.metric, used: q.used, limit: q.limit })
  }
  const actor: Actor = { auth: a, userId, orgId, role, entitlementId }
  // 8. recurso externo
  if (need.external && !(await need.external(actor))) {
    throw new DomainError('external_resource_denied', 'O serviço de origem não autorizou este acesso.')
  }
  return actor
}

/**
 * Console de administração: papel de plataforma, nunca papel de organização. As áreas do console usam requireConsole
 * (console-papeis.ts), que sabe o que cada papel vê; esta guarda segue para as operações de admin e suporte.
 */
export function requirePlatformAdmin(auth: Authenticated | null, roles: ('admin' | 'support' | 'financeiro')[] = ['admin']): UserActor {
  const u = requireUser(auth, { verifiedEmail: true })
  if (!auth!.user.platformRole || !roles.includes(auth!.user.platformRole)) {
    throw new DomainError('platform_role_required', 'Área restrita à administração da plataforma.')
  }
  return u
}
