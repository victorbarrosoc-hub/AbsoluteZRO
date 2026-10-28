'use server'
/**
 * Administração › Lançamento (ADR 0023): estado e canais por produto, e as contas autorizadas no que está fechado.
 * Só papel admin da plataforma; toda ação pede motivo e fica na auditoria (trigger da migration 0018). Ser admin NÃO
 * dá acesso aos produtos fechados: a lista é por conta escolhida, nunca por papel.
 */
import { revalidatePath } from 'next/cache'
import {
  grantReleaseAccess,
  RELEASE_ACCESS_KINDS,
  RELEASE_CHANNELS,
  RELEASE_STATES,
  revokeReleaseAccess,
  setProductRelease,
  type ReleaseAccessKind,
  type ReleaseChannel,
  type ReleaseChannels,
  type ReleaseState,
} from '@zro/billing'
import { requirePlatformAdmin } from '@zro/core'
import { audit, DomainError } from '@zro/observability'
import type { FormState } from '@/components/action-form'
import { db, getAuth } from '../session'
import { str, toFormError } from './helpers'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PRODUCT = /^[a-z0-9-]{1,40}$/

async function adminActor(fd: FormData) {
  const u = requirePlatformAdmin(await getAuth())
  const reason = str(fd, 'reason').slice(0, 500)
  if (!reason) throw new DomainError('invalid_input', 'Informe o motivo (fica na auditoria).')
  return { userId: u.userId, reason }
}

const productId = (fd: FormData) => {
  const v = str(fd, 'productId')
  if (!PRODUCT.test(v)) throw new DomainError('invalid_input', 'Escolha o produto.')
  return v
}

const userId = (fd: FormData) => {
  const v = str(fd, 'userId')
  if (!UUID.test(v)) throw new DomainError('invalid_input', 'Escolha a pessoa na lista.')
  return v
}

const channelsOf = (fd: FormData): ReleaseChannel[] => RELEASE_CHANNELS.filter((c) => fd.get(`channel_${c}`) === 'on')

const date = (s: string) => {
  if (!s) return null
  const d = new Date(`${s}T23:59:59-03:00`)
  if (Number.isNaN(d.getTime())) throw new DomainError('invalid_input', 'Data inválida.')
  return d
}

function refresh() {
  revalidatePath('/admin/lancamento')
  revalidatePath('/admin')
}

export async function setReleaseAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const actor = await adminActor(fd)
    const state = str(fd, 'state') as ReleaseState
    if (!RELEASE_STATES.includes(state)) throw new DomainError('invalid_input', 'Estado de lançamento desconhecido.')
    const channels = Object.fromEntries(RELEASE_CHANNELS.map((c) => [c, fd.get(`channel_${c}`) === 'on'])) as ReleaseChannels
    const r = await db().asSystem('admin: estado de lançamento', (tx) => setProductRelease(tx, actor, { productId: productId(fd), state, channels }))
    refresh()
    return {
      ok: r.open ? 'Salvo. Aberto ao público nos canais marcados (vale em até 30 s em todas as instâncias).' : 'Salvo. Fechado: só as contas da lista entram.',
    }
  } catch (e) {
    return toFormError(e)
  }
}

export async function grantReleaseAccessAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const actor = await adminActor(fd)
    const kind = str(fd, 'kind') as ReleaseAccessKind
    if (!RELEASE_ACCESS_KINDS.includes(kind)) throw new DomainError('invalid_input', 'Tipo de acesso desconhecido.')
    await db().asSystem('admin: conceder acesso interno', (tx) =>
      grantReleaseAccess(tx, actor, { productId: productId(fd), userId: userId(fd), kind, channels: channelsOf(fd), endsAt: date(str(fd, 'until')) }),
    )
    refresh()
    return { ok: 'Acesso concedido. A pessoa entra no próximo login no app.' }
  } catch (e) {
    return toFormError(e)
  }
}

export async function revokeReleaseAccessAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const actor = await adminActor(fd)
    const product = productId(fd)
    const user = userId(fd)
    const n = await db().asSystem('admin: revogar acesso interno', async (tx) => {
      await revokeReleaseAccess(tx, actor, { productId: product, userId: user })
      // Sessões já abertas nos apps desse produto caem junto (refresh e consentimento); o token de 10 min morre no próximo pedido.
      const tokens = await tx`update zro.oauth_refresh_tokens set revoked_at = now()
        where user_id = ${user} and revoked_at is null and client_id in (select id from zro.oauth_clients where product_id = ${product}) returning id`
      const consents = await tx`update zro.oauth_consents set revoked_at = now()
        where user_id = ${user} and revoked_at is null and client_id in (select id from zro.oauth_clients where product_id = ${product}) returning client_id`
      if (tokens.length || consents.length) {
        await audit(tx, {
          actorUserId: actor.userId,
          actorKind: 'admin',
          action: 'release.tokens_revoked',
          targetType: 'product',
          targetId: product,
          metadata: { user_id: user, refreshTokens: tokens.length, consents: consents.length, reason: actor.reason },
        })
      }
      return tokens.length
    })
    refresh()
    return { ok: n ? `Acesso revogado e ${n} sessão(ões) do app encerrada(s).` : 'Acesso revogado.' }
  } catch (e) {
    return toFormError(e)
  }
}
