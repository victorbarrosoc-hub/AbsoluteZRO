'use server'
import { cookies } from 'next/headers'
import { redirect } from './ir'
import {
  changePassword,
  defaultSender,
  newVerifyToken,
  requestPasswordReset,
  resetPassword,
  revokeOwnSession,
  revokeSessionByToken,
  SESSION_COOKIE,
  signIn,
  signUp,
  verifyEmail,
} from '@zro/auth'
import type { FormState } from '@/components/action-form'
import { appOrigin, showDevLinks } from '../env'
import { clearSessionCookie, db, getAuth, requestMeta, setSessionCookie } from '../session'
import { emailConfirmacao, emailNovaSenha } from '../email/modelos'
import { safeNext, str, toFormError } from './helpers'

const mail = defaultSender()

async function sendVerify(email: string, token: string, opts: { nome?: string | null; boasVindas: boolean }): Promise<{ devLink?: string; enviado: boolean }> {
  const link = `${appOrigin}/confirmar-email?token=${encodeURIComponent(token)}`
  // A conta já existe: falha no envio não pode parecer falha no cadastro (a pessoa reenvia pela conta).
  const enviado = await mail
    .send(emailConfirmacao(email, link, opts))
    .then(() => true)
    .catch((e) => {
      console.error('[e-mail] confirmação não enviada:', e instanceof Error ? e.message : e)
      return false
    })
  return { devLink: showDevLinks ? link : undefined, enviado }
}

export async function signupAction(_: FormState, fd: FormData): Promise<FormState> {
  let ok = false
  try {
    const email = str(fd, 'email')
    const r = await signUp(
      db(),
      // O @ escolhido na conversa (0029); sugestão aceita sem mexer vira a do banco se alguém já tiver.
      {
        email,
        password: String(fd.get('password') ?? ''),
        displayName: str(fd, 'name'),
        arroba: str(fd, 'arroba') || null,
        arrobaFlexivel: str(fd, 'arroba_sugerida') === '1',
      },
      await requestMeta(),
    )
    await setSessionCookie(r.session.token)
    await sendVerify(email, r.verifyToken, { nome: str(fd, 'name'), boasVindas: true })
    ok = true
  } catch (e) {
    return toFormError(e)
  }
  const next = safeNext(str(fd, 'next'))
  if (!ok) return null
  const to = next ? `/boas-vindas?next=${encodeURIComponent(next)}` : '/boas-vindas'
  // Na conversa (com JavaScript) o cliente mostra "pronto" e abre o destino; sem JavaScript, redireciona aqui.
  if (str(fd, 'conversa') === '1') return { ok: 'pronto', data: { to } }
  redirect(to)
}

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const r = await signIn(db(), { email: str(fd, 'email'), password: String(fd.get('password') ?? '') }, await requestMeta())
    await setSessionCookie(r.token)
  } catch (e) {
    return toFormError(e)
  }
  const to = safeNext(str(fd, 'next')) ?? '/inicio'
  if (str(fd, 'conversa') === '1') return { ok: 'pronto', data: { to } }
  redirect(to)
}

export async function logoutAction() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (token) await revokeSessionByToken(db(), token)
  await clearSessionCookie()
  redirect('/entrar')
}

/** Sair pelo painel do app de computador: volta para o login do próprio app. */
export async function logoutAppAction() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (token) await revokeSessionByToken(db(), token)
  await clearSessionCookie()
  redirect('/app/entrar')
}

export async function forgotAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const r = await requestPasswordReset(db(), str(fd, 'email'))
    let devLink: string | undefined
    if (r) {
      const link = `${appOrigin}/redefinir-senha?token=${encodeURIComponent(r.token)}`
      await mail.send(emailNovaSenha(r.email, link))
      if (showDevLinks) devLink = link
    }
    if (!mail.deliveryAvailable) return { error: 'O envio de e-mail ainda não está ligado nesta instalação. Fale com o suporte.' }
    return { ok: 'Se existir uma conta com esse e-mail, enviamos um link para criar uma nova senha.', devLink }
  } catch (e) {
    return toFormError(e)
  }
}

export async function resetAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    await resetPassword(db(), str(fd, 'token'), String(fd.get('password') ?? ''))
  } catch (e) {
    return toFormError(e)
  }
  // Quem redefiniu entra de novo com a senha nova: a sessão que já estava aberta neste aparelho (de qualquer conta) é
  // encerrada, para /entrar não pular direto para o painel de outra pessoa.
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (token) await revokeSessionByToken(db(), token)
  await clearSessionCookie()
  redirect('/entrar?senha=nova')
}

export async function verifyEmailAction(_: FormState, fd: FormData): Promise<FormState> {
  const ok = await verifyEmail(db(), str(fd, 'token'))
  return ok ? { ok: 'E-mail confirmado.' } : { error: 'Link inválido, já usado ou vencido.' }
}

export async function resendVerifyAction(): Promise<FormState> {
  const auth = await getAuth()
  if (!auth) return { error: 'Entre na sua conta.' }
  if (auth.user.emailVerified) return { ok: 'Seu e-mail já está confirmado.' }
  const token = await newVerifyToken(db(), auth.user.id)
  const { devLink, enviado } = await sendVerify(auth.user.email, token, { nome: auth.user.displayName, boasVindas: true })
  if (!mail.deliveryAvailable) return { error: 'O envio de e-mail ainda não está ligado nesta instalação.' }
  if (!enviado) return { error: 'Não conseguimos enviar agora. Tente de novo em instantes.' }
  return { ok: 'Enviamos um novo link de confirmação.', devLink }
}

export async function changePasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const auth = await getAuth()
  if (!auth) return { error: 'Entre na sua conta.' }
  try {
    await changePassword(db(), auth.user.id, auth.session.id, String(fd.get('current') ?? ''), String(fd.get('next') ?? ''))
    return { ok: 'Senha trocada. As outras sessões foram encerradas.' }
  } catch (e) {
    return toFormError(e)
  }
}

export async function revokeSessionAction(fd: FormData) {
  const auth = await getAuth()
  if (!auth) redirect('/entrar')
  await revokeOwnSession(db(), auth.user.id, str(fd, 'sessionId'))
  redirect('/perfil/seguranca')
}

export async function themeAction(fd: FormData) {
  const theme = ['light', 'paper'].includes(str(fd, 'theme')) ? 'light' : 'dark'
  ;(await cookies()).set('zro_theme', theme, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  const back = str(fd, 'back')
  redirect(back.startsWith('/') && !back.startsWith('//') ? back : '/perfil')
}
