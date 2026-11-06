'use server'
import { desktopLoginReturnUrl, issueDesktopLoginCode, parseDesktopLoginRequest } from '@zro/auth'
import { createLogger } from '@zro/observability'
import { db, getAuth } from '../session'

const log = createLogger('desktop-login')

export type EmitirCodigoResultado = { url?: string; erro?: string }

/**
 * "Voltar para o app" (ADR 0041): revalida o pedido inteiro (nada vem confiado do formulário), exige a sessão da pessoa
 * e emite o código de uso único. O endereço devolvido é `<esquema>://entrar-app?code=…&state=…`, com o esquema da lista
 * fechada de @zro/auth. Server Action: o Next já confere a origem (CSRF).
 */
export async function emitirCodigoDoAppAction(fd: FormData): Promise<EmitirCodigoResultado> {
  const parsed = parseDesktopLoginRequest({
    app: String(fd.get('app') ?? ''),
    state: String(fd.get('state') ?? ''),
    challenge: String(fd.get('challenge') ?? ''),
    next: String(fd.get('next') ?? '') || null,
  })
  if (!parsed.ok) return { erro: 'Pedido inválido. Volte ao app e tente de novo.' }
  const auth = await getAuth()
  if (!auth) return { erro: 'Sua sessão acabou. Entre de novo.' }
  try {
    const code = await db().asSystem('auth: emitir código de entrada do app', (tx) => issueDesktopLoginCode(tx, auth.user.id, parsed.req))
    return { url: desktopLoginReturnUrl(parsed.req.app, code, parsed.req.state) }
  } catch (e) {
    log.error('desktop-login.emitir', { error: e })
    return { erro: 'Algo deu errado do nosso lado. Tente de novo.' }
  }
}
