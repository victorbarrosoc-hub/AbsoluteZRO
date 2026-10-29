'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from './ir'
import { defaultSender } from '@zro/auth'
import {
  acceptInvitation,
  changeMemberRole,
  createOrganization,
  inviteMember,
  removeMember,
  revokeInvitation,
  switchOrganization,
  type OrgRole,
} from '@zro/core'
import type { FormState } from '@/components/action-form'
import { appOrigin, showDevLinks } from '../env'
import { db, getAuth } from '../session'
import { emailConvite } from '../email/modelos'
import { safeNext, str, toFormError } from './helpers'

const mail = defaultSender()

export async function createOrgAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const kind = str(fd, 'kind')
    await createOrganization(db(), await getAuth(), { name: str(fd, 'name'), kind: kind === 'person' || kind === 'company' ? kind : 'team' })
  } catch (e) {
    return toFormError(e)
  }
  redirect(safeNext(str(fd, 'next')) ?? '/inicio')
}

export async function switchOrgAction(fd: FormData) {
  await switchOrganization(db(), await getAuth(), str(fd, 'orgId'))
  const back = str(fd, 'back')
  redirect(back.startsWith('/') && !back.startsWith('//') && !back.startsWith('/projetos/') ? back : '/inicio')
}

export async function inviteAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const r = await inviteMember(db(), await getAuth(), { email: str(fd, 'email'), role: str(fd, 'role') as Exclude<OrgRole, 'owner'> })
    const link = `${appOrigin}/convite?token=${encodeURIComponent(r.token)}`
    await mail.send(emailConvite(r.email, link))
    revalidatePath('/equipe')
    return {
      ok: mail.deliveryAvailable
        ? `Convite enviado para ${r.email}.`
        : `Convite criado para ${r.email}. O envio de e-mail ainda não está ligado: compartilhe o link com a pessoa.`,
      devLink: showDevLinks || !mail.deliveryAvailable ? link : undefined,
    }
  } catch (e) {
    return toFormError(e)
  }
}

export async function acceptInviteAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    await acceptInvitation(db(), await getAuth(), str(fd, 'token'))
  } catch (e) {
    return toFormError(e)
  }
  redirect('/inicio')
}

export async function revokeInviteAction(fd: FormData) {
  await revokeInvitation(db(), await getAuth(), str(fd, 'invitationId'))
  redirect('/equipe')
}

export async function changeRoleAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    await changeMemberRole(db(), await getAuth(), str(fd, 'userId'), str(fd, 'role') as OrgRole)
    revalidatePath('/equipe')
    return { ok: 'Papel atualizado.' }
  } catch (e) {
    return toFormError(e)
  }
}

export async function removeMemberAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    await removeMember(db(), await getAuth(), str(fd, 'userId'))
    revalidatePath('/equipe')
    return { ok: 'Pessoa removida da organização.' }
  } catch (e) {
    return toFormError(e)
  }
}
