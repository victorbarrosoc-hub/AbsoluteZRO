'use server'
/**
 * Administração › Apps › RADION (ADR 0042): quem entra no rádio enquanto ele está fechado. É a mesma lista de
 * acesso do gate de lançamento (zro.product_release_access, ADR 0023), só que pelo e-mail da conta, no cartão do app.
 * Só papel admin da plataforma; tudo fica na auditoria pelo trigger da migration 0018. Quem não tem conta Absolute ZRO
 * ainda não entra: a conta nasce na Absolute ZRO, nunca aqui.
 */
import { revalidatePath } from 'next/cache'
import { grantReleaseAccess, revokeReleaseAccess } from '@zro/billing'
import { requirePlatformAdmin } from '@zro/core'
import { DomainError } from '@zro/observability'
import type { FormState } from '@/components/action-form'
import { PRODUTO_RADIO } from '../radio'
import { db, getAuth } from '../session'
import { str, toFormError } from './helpers'

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** O rádio é web (a página e a API do HUB pela sessão). */
// web: absolutezro.com/radio; sso e api: o login e o Set no radion.absolutezro.com
const CANAIS_DO_RADIO = ['web', 'sso', 'api'] as const

function atualizar() {
  revalidatePath('/admin/apps')
  revalidatePath('/admin/lancamento')
}

export async function darAcessoAoRadioAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const admin = requirePlatformAdmin(await getAuth())
    const email = str(fd, 'email').trim().toLowerCase()
    if (!EMAIL.test(email)) throw new DomainError('invalid_input', 'Digite um e-mail válido.')
    const nome = await db().asSystem('admin: acesso ao rádio pelo e-mail', async (tx) => {
      const [u] = await tx`select id, display_name from zro.users where lower(email) = ${email} and status = 'active'`
      if (!u) throw new DomainError('not_found', 'Esse e-mail ainda não tem conta Absolute ZRO. Peça para criar em absolutezro.com/criar-conta.')
      await grantReleaseAccess(
        tx,
        { userId: admin.userId, reason: 'RADION: acesso pelo e-mail no console' },
        { productId: PRODUTO_RADIO, userId: u.id as string, kind: 'tester', channels: [...CANAIS_DO_RADIO], endsAt: null },
      )
      return (u.display_name as string) || email
    })
    atualizar()
    return { ok: `${nome} já entra no rádio.` }
  } catch (e) {
    return toFormError(e)
  }
}

export async function tirarAcessoAoRadioAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const admin = requirePlatformAdmin(await getAuth())
    const userId = str(fd, 'userId')
    if (!UUID.test(userId)) throw new DomainError('invalid_input', 'Pedido inválido.')
    await db().asSystem('admin: tirar acesso ao rádio', (tx) =>
      revokeReleaseAccess(tx, { userId: admin.userId, reason: 'RADION: acesso tirado no console' }, { productId: PRODUTO_RADIO, userId }),
    )
    atualizar()
    // o gate é lido a cada pedido: a pessoa sai do rádio no próximo toque, sem esperar sessão vencer
    return { ok: 'Acesso tirado.' }
  } catch (e) {
    return toFormError(e)
  }
}
