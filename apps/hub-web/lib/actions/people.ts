'use server'
/** Ações do painel de pessoas (/admin/pessoas). Só papel admin: o suporte vê, mas não muda nada. */
import { revalidatePath } from 'next/cache'
import { changeOrgPlan } from '@zro/billing'
import { reactivateUser, requirePlatformAdmin, suspendUser } from '@zro/core'
import { DomainError } from '@zro/observability'
import type { FormState } from '@/components/action-form'
import { db, getAuth } from '../session'
import { str, toFormError } from './helpers'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function actor(fd: FormData, fallbackReason = '') {
  const u = requirePlatformAdmin(await getAuth())
  const reason = (str(fd, 'reason') || fallbackReason).slice(0, 200)
  if (!reason) throw new DomainError('invalid_input', 'Informe o motivo (fica na auditoria).')
  return { userId: u.userId, reason }
}

const id = (fd: FormData, k: string) => {
  const v = str(fd, k)
  if (!UUID.test(v)) throw new DomainError('invalid_input', 'Pedido inválido.')
  return v
}

function refresh(userId?: string) {
  revalidatePath('/admin/pessoas')
  if (userId) revalidatePath(`/admin/pessoas/${userId}`)
  revalidatePath('/admin')
}

export async function changeOrgPlanAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const a = await actor(fd, 'Troca no painel')
    const orgId = id(fd, 'orgId')
    const planId = id(fd, 'planId')
    await db().asSystem('admin: trocar plano da organização', (tx) => changeOrgPlan(tx, a, { orgId, planId }))
    refresh(str(fd, 'userId') || undefined)
    return { ok: 'Plano trocado.' }
  } catch (e) {
    return toFormError(e)
  }
}

export async function suspendUserAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const a = await actor(fd)
    const userId = id(fd, 'userId')
    const r = await db().asSystem('admin: suspender conta', (tx) => suspendUser(tx, a, userId))
    refresh(userId)
    return { ok: `Conta suspensa. ${r.sessions + r.refreshTokens} acesso(s) encerrado(s).` }
  } catch (e) {
    return toFormError(e)
  }
}

export async function reactivateUserAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const a = await actor(fd)
    const userId = id(fd, 'userId')
    await db().asSystem('admin: reativar conta', (tx) => reactivateUser(tx, a, userId))
    refresh(userId)
    return { ok: 'Conta reativada. A pessoa entra de novo.' }
  } catch (e) {
    return toFormError(e)
  }
}
