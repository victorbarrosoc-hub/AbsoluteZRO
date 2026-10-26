'use server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { confirmEmailChange, defaultSender, requestEmailChange } from '@zro/auth'
import { cancelPlanRequest, removeAvatar, requestPlanChange, setAvatar, updateDisplayName, type PlanRequestKind } from '@zro/core'
import type { FormState } from '@/components/action-form'
import { appOrigin, showDevLinks } from '../env'
import { db, getAuth } from '../session'
import { str, toFormError } from './helpers'

const mail = defaultSender()

export async function updateNameAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    await updateDisplayName(db(), await getAuth(), str(fd, 'name'))
    revalidatePath('/', 'layout')
    return { ok: 'Nome salvo.' }
  } catch (e) {
    return toFormError(e)
  }
}

export async function avatarAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const file = fd.get('photo')
    if (!(file instanceof File) || !file.size) return { error: 'Escolha uma foto.' }
    await setAvatar(db(), await getAuth(), new Uint8Array(await file.arrayBuffer()))
    revalidatePath('/', 'layout')
    return { ok: 'Foto atualizada.' }
  } catch (e) {
    return toFormError(e)
  }
}

export async function removeAvatarAction() {
  await removeAvatar(db(), await getAuth())
  revalidatePath('/', 'layout')
  redirect('/perfil')
}

export async function requestEmailChangeAction(_: FormState, fd: FormData): Promise<FormState> {
  const auth = await getAuth()
  if (!auth) return { error: 'Entre na sua conta.' }
  try {
    const r = await requestEmailChange(db(), auth.user.id, String(fd.get('password') ?? ''), str(fd, 'email'))
    const link = `${appOrigin}/trocar-email?token=${encodeURIComponent(r.token)}`
    await mail.send({
      to: r.email,
      subject: 'Confirme seu novo e-mail na Absolute ZRO',
      text: `Para usar este e-mail na sua conta, abra (vale 48 horas): ${link}`,
    })
    if (!mail.deliveryAvailable) return { error: 'O envio de e-mail ainda não está ligado nesta instalação.', devLink: showDevLinks ? link : undefined }
    return { ok: `Enviamos um link para ${r.email}. O e-mail atual vale até você confirmar.`, devLink: showDevLinks ? link : undefined }
  } catch (e) {
    return toFormError(e)
  }
}

export async function confirmEmailChangeAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const r = await confirmEmailChange(db(), str(fd, 'token'))
    if (!r) return { error: 'Link inválido, já usado ou vencido.' }
    await mail.send({
      to: r.oldEmail,
      subject: 'O e-mail da sua conta Absolute ZRO mudou',
      text: `A sua conta agora entra com ${r.email}. Se não foi você, fale com o suporte: zro.contato@gmail.com`,
    })
    return { ok: `Pronto. Sua conta agora usa ${r.email}.` }
  } catch (e) {
    return toFormError(e)
  }
}

export async function planRequestAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const kind = str(fd, 'kind') as PlanRequestKind
    await requestPlanChange(db(), await getAuth(), { kind, planId: str(fd, 'planId') || null })
    revalidatePath('/perfil/plano')
    return { ok: 'Pedido enviado. A equipe Absolute ZRO libera e você vê aqui quando mudar.' }
  } catch (e) {
    return toFormError(e)
  }
}

export async function cancelPlanRequestAction(fd: FormData) {
  await cancelPlanRequest(db(), await getAuth(), str(fd, 'requestId'))
  redirect('/perfil/plano')
}

/** Menu lateral recolhido ou aberto. Com JavaScript a troca é na hora; sem ele, este formulário grava e volta. */
export async function navAction(fd: FormData) {
  const mode = str(fd, 'nav') === 'rail' ? 'rail' : 'full'
  ;(await cookies()).set('zro_nav', mode, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  const back = str(fd, 'back')
  redirect(back.startsWith('/') && !back.startsWith('//') ? back : '/inicio')
}
