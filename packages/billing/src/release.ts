/**
 * Gate de lançamento (ADR 0023, migration 0018): o produto está aberto ao público ou só para contas listadas?
 * É um eixo separado do entitlement: o gate diz se o produto está lançado; o plano diz se a organização contratou.
 * Deny-by-default: produto sem linha em zro.product_release é fechado, e fechado só abre para quem está em
 * zro.product_release_access (por user_id, no canal pedido). A regra mora no banco (zro.release_allows) para o HUB, o
 * login único, a API e o catálogo lerem a mesma coisa.
 *
 * - `releaseState(tx)`: o estado de cada produto, em cache de processo por 30 s (estados mudam raramente).
 * - `releaseAllows(tx, produto, pessoa, canal)`: por pedido, sem cache, para revogação valer na hora.
 * - `releaseVisibleFor(tx, pessoa)`: os produtos que existem para a pessoa (passa em algum canal). O que não está aqui
 *   não aparece em lista, menu, claim nem resposta de API (titular, 01/11/2026: app não lançado não aparece nem como
 *   "Em desenvolvimento"). Admin da plataforma vê tudo (zro.release_allows, migração 0049).
 */
import type { Queryable } from '@zro/db'
import { DomainError } from '@zro/observability'

export const RELEASE_STATES = ['development', 'internal_beta', 'private_beta', 'public_beta', 'released', 'retired'] as const
export type ReleaseState = (typeof RELEASE_STATES)[number]
export const RELEASE_CHANNELS = ['web', 'desktop', 'api', 'download', 'sso'] as const
export type ReleaseChannel = (typeof RELEASE_CHANNELS)[number]
export type ReleaseChannels = Record<ReleaseChannel, boolean>
export const RELEASE_ACCESS_KINDS = ['owner', 'internal', 'tester'] as const
export type ReleaseAccessKind = (typeof RELEASE_ACCESS_KINDS)[number]

export type ReleaseInfo = {
  productId: string
  state: ReleaseState
  /** Aberto ao público (released ou public_beta). Os canais dizem por onde. */
  open: boolean
  channels: ReleaseChannels
  note: string
  updatedAt: Date | null
}

/** O que o login único conta a cada app: released = aberto ao público; allowed = fechado, mas esta conta entra; closed = fechado. */
export type ReleaseClaim = 'released' | 'allowed' | 'closed'

export const RELEASE_CLOSED_MESSAGE = 'Este app não está disponível para a sua conta.'
export const RELEASE_CACHE_MS = 30_000

export const isReleaseOpen = (state: ReleaseState | null | undefined): boolean => state === 'released' || state === 'public_beta'

const NO_CHANNELS: ReleaseChannels = { web: false, desktop: false, api: false, download: false, sso: false }

/** Produto sem linha: fechado, sem canal. */
export const closedRelease = (productId: string): ReleaseInfo => ({
  productId,
  state: 'development',
  open: false,
  channels: { ...NO_CHANNELS },
  note: '',
  updatedAt: null,
})

function rowToInfo(r: Record<string, unknown>): ReleaseInfo {
  const state = (r.state as ReleaseState | null) ?? 'development'
  return {
    productId: r.id as string,
    state,
    open: isReleaseOpen(state),
    channels: r.state ? { web: !!r.web, desktop: !!r.desktop, api: !!r.api, download: !!r.download, sso: !!r.sso } : { ...NO_CHANNELS },
    note: (r.note as string) ?? '',
    updatedAt: (r.updated_at as Date) ?? null,
  }
}

let cache: { at: number; byId: Record<string, ReleaseInfo> } | null = null

/** Estado de lançamento de todos os produtos do catálogo (sem linha = development, canais fechados). Cache de 30 s. */
export async function releaseState(tx: Queryable, opts: { fresh?: boolean } = {}): Promise<Record<string, ReleaseInfo>> {
  if (!opts.fresh && cache && Date.now() - cache.at < RELEASE_CACHE_MS) return cache.byId
  const rows = await tx`
    select p.id, r.state, r.web, r.desktop, r.api, r.download, r.sso, r.note, r.updated_at
    from zro.products p left join zro.product_release r on r.product_id = p.id order by p.step_order`
  const byId: Record<string, ReleaseInfo> = {}
  for (const r of rows) byId[r.id as string] = rowToInfo(r)
  cache = { at: Date.now(), byId }
  return byId
}

/** Esquece o cache (depois de mudar um estado no console, e nos testes). */
export function resetReleaseCache() {
  cache = null
}

/** A regra do banco, por pedido e sem cache. Pessoa nula = anônimo. */
export async function releaseAllows(tx: Queryable, productId: string, userId: string | null, channel: ReleaseChannel): Promise<boolean> {
  const [r] = await tx`select zro.release_allows(${productId}, ${userId}::uuid, ${channel}) as ok`
  return !!r?.ok
}

/**
 * Os produtos que existem para a pessoa: abertos ao público em algum canal, na lista de acesso dela ou (admin da
 * plataforma) todos. Anônimo (`null`) = só o que está aberto ao público. Sem cache: revogação vale na hora.
 */
export async function releaseVisibleFor(tx: Queryable, userId: string | null): Promise<Set<string>> {
  const rows = await tx`select p.id from zro.products p where zro.release_visible(p.id, ${userId}::uuid) order by p.step_order`
  return new Set(rows.map((r) => r.id as string))
}

/**
 * Os produtos visíveis para a pessoa, um valor por produto (claim zro_release do login único e catálogo por pessoa).
 * Produto que não existe para ela (não lançado) nem entra: nada de "closed" com o id dele (o app lê ausente = fechado).
 */
export async function releaseClaimsFor(tx: Queryable, userId: string | null, channel: ReleaseChannel = 'sso'): Promise<Record<string, ReleaseClaim>> {
  const rows = await tx`
    select p.id, r.state, zro.release_allows(p.id, ${userId}::uuid, ${channel}) as allowed
    from zro.products p left join zro.product_release r on r.product_id = p.id
    where zro.release_visible(p.id, ${userId}::uuid) order by p.step_order`
  const out: Record<string, ReleaseClaim> = {}
  for (const r of rows) out[r.id as string] = r.allowed ? (isReleaseOpen(r.state as ReleaseState | null) ? 'released' : 'allowed') : 'closed'
  return out
}

// ───────────── console (Administração › Lançamento) ─────────────

type Actor = { userId: string; reason: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function requireReason(actor: Actor) {
  if (!actor.reason.trim()) throw new DomainError('invalid_input', 'Informe o motivo (fica na auditoria).')
}

/** Estado e canais de um produto. O motivo vira a nota da linha e vai para a auditoria (trigger). */
export async function setProductRelease(
  tx: Queryable,
  actor: Actor,
  input: { productId: string; state: ReleaseState; channels: Partial<ReleaseChannels> },
): Promise<ReleaseInfo> {
  requireReason(actor)
  if (!RELEASE_STATES.includes(input.state)) throw new DomainError('invalid_input', 'Estado de lançamento desconhecido.')
  const [p] = await tx`select id from zro.products where id = ${input.productId}`
  if (!p) throw new DomainError('not_found', 'Produto não encontrado.')
  const c = { ...NO_CHANNELS, ...input.channels }
  await tx`
    insert into zro.product_release (product_id, state, web, desktop, api, download, sso, note, updated_by)
    values (${input.productId}, ${input.state}, ${c.web}, ${c.desktop}, ${c.api}, ${c.download}, ${c.sso}, ${actor.reason.trim().slice(0, 500)}, ${actor.userId})
    on conflict (product_id) do update set state = excluded.state, web = excluded.web, desktop = excluded.desktop, api = excluded.api,
      download = excluded.download, sso = excluded.sso, note = excluded.note, updated_by = excluded.updated_by`
  resetReleaseCache()
  return (await releaseState(tx, { fresh: true }))[input.productId] ?? closedRelease(input.productId)
}

export type ReleaseAccessRow = {
  productId: string
  userId: string
  kind: ReleaseAccessKind
  channels: ReleaseChannel[]
  reason: string
  grantedBy: string | null
  startsAt: Date
  endsAt: Date | null
  revokedAt: Date | null
  /** Vigente agora (sem revogação, dentro do prazo). */
  active: boolean
  userName: string
  userEmail: string
}

/**
 * Conta autorizada num produto fechado. Só por user_id de uma conta ativa, escolhida na lista (nunca por e-mail
 * digitado nem por papel). Conceder de novo renova a linha (canais, validade, motivo) e desfaz uma revogação anterior.
 */
export async function grantReleaseAccess(
  tx: Queryable,
  actor: Actor,
  input: { productId: string; userId: string; kind: ReleaseAccessKind; channels: ReleaseChannel[]; endsAt: Date | null },
): Promise<void> {
  requireReason(actor)
  if (!RELEASE_ACCESS_KINDS.includes(input.kind)) throw new DomainError('invalid_input', 'Tipo de acesso desconhecido.')
  const channels = [...new Set(input.channels)]
  if (!channels.length || channels.some((ch) => !RELEASE_CHANNELS.includes(ch))) throw new DomainError('invalid_input', 'Escolha pelo menos um canal válido.')
  if (!UUID.test(input.userId)) throw new DomainError('invalid_input', 'Escolha a pessoa na lista.')
  if (input.endsAt && input.endsAt.getTime() <= Date.now()) throw new DomainError('invalid_input', 'A validade precisa ser no futuro.')
  const [p] = await tx`select id from zro.products where id = ${input.productId}`
  if (!p) throw new DomainError('not_found', 'Produto não encontrado.')
  const [u] = await tx`select id from zro.users where id = ${input.userId} and status = 'active'`
  if (!u) throw new DomainError('not_found', 'Conta não encontrada ou inativa.')
  await tx`
    insert into zro.product_release_access (product_id, user_id, kind, channels, reason, granted_by, ends_at)
    values (${input.productId}, ${input.userId}, ${input.kind}, ${channels}, ${actor.reason.trim().slice(0, 500)}, ${actor.userId}, ${input.endsAt})
    on conflict (product_id, user_id) do update set kind = excluded.kind, channels = excluded.channels, reason = excluded.reason,
      granted_by = excluded.granted_by, starts_at = now(), ends_at = excluded.ends_at, revoked_at = null, revoked_by = null, revoke_reason = null`
}

export async function revokeReleaseAccess(tx: Queryable, actor: Actor, input: { productId: string; userId: string }): Promise<void> {
  requireReason(actor)
  if (!UUID.test(input.userId)) throw new DomainError('invalid_input', 'Pedido inválido.')
  const r = await tx`
    update zro.product_release_access set revoked_at = now(), revoked_by = ${actor.userId}, revoke_reason = ${actor.reason.trim().slice(0, 500)}
    where product_id = ${input.productId} and user_id = ${input.userId} and revoked_at is null returning user_id`
  if (!r.length) throw new DomainError('not_found', 'Este acesso não existe ou já foi revogado.')
}

/** Lista de acessos (console). Por padrão só os não revogados; `all` traz o histórico. */
export async function listReleaseAccess(tx: Queryable, opts: { productId?: string; all?: boolean } = {}): Promise<ReleaseAccessRow[]> {
  const rows = await tx`
    select a.product_id, a.user_id, a.kind, a.channels, a.reason, a.granted_by, a.starts_at, a.ends_at, a.revoked_at,
           u.display_name, u.email,
           (a.revoked_at is null and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())) as active
    from zro.product_release_access a join zro.users u on u.id = a.user_id
    where (${opts.productId ?? null}::text is null or a.product_id = ${opts.productId ?? null})
      and (${!!opts.all}::boolean or a.revoked_at is null)
    order by a.product_id, a.revoked_at nulls first, a.starts_at desc limit 500`
  return rows.map((r) => ({
    productId: r.product_id as string,
    userId: r.user_id as string,
    kind: r.kind as ReleaseAccessKind,
    channels: r.channels as ReleaseChannel[],
    reason: r.reason as string,
    grantedBy: (r.granted_by as string) ?? null,
    startsAt: r.starts_at as Date,
    endsAt: (r.ends_at as Date) ?? null,
    revokedAt: (r.revoked_at as Date) ?? null,
    active: !!r.active,
    userName: (r.display_name as string) || (r.email as string),
    userEmail: r.email as string,
  }))
}
