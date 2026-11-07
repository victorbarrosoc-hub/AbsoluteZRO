/**
 * Entrar pelo navegador do sistema, para os apps de computador (ADR 0041).
 *
 * O Google recusa OAuth dentro da janela embutida do Electron (disallowed_useragent). O app abre o HUB no navegador do
 * sistema; a pessoa entra lá (Google, e-mail e senha, o que for) e o HUB devolve um código de USO ÚNICO, de 60 s,
 * pelo deep link do app (`relay://entrar-app?code=…&state=…`). O app troca o código por uma sessão do HUB (cookie) dentro
 * da própria janela. Padrão RFC 8252 (app nativo em navegador externo) com PKCE: o desafio (S256) é do app, que guarda o
 * verifier; quem interceptar o deep link não tem como trocar o código.
 *
 * Duas regras de ouro: o destino do deep link sai de uma lista fechada de esquemas (nunca de uma URL do cliente) e o
 * "voltar para" é só um caminho do próprio HUB.
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import type { Database, Queryable } from '@zro/db'
import { DomainError } from '@zro/observability'
import { createSession } from './sessions'
import { hashToken, newToken, TOKEN_FORMAT } from './tokens'

/** Esquemas dos apps de computador que podem receber o retorno. Lista fechada: nada fora dela vira redirecionamento. */
export const DESKTOP_LOGIN_APPS = ['absolutezro', 'relay', 'maestro', 'tpeasy', 'carrodofreela', 'rift', 'radion'] as const
export type DesktopLoginApp = (typeof DESKTOP_LOGIN_APPS)[number]

/** Quanto o código vale. */
export const DESKTOP_LOGIN_TTL_MS = 60_000
/** Host do deep link: `<esquema>://entrar-app?code=…&state=…`. */
export const DESKTOP_LOGIN_HOST = 'entrar-app'

const CHALLENGE = /^[A-Za-z0-9_-]{43}$/ // sha256 em base64url
const STATE = /^[A-Za-z0-9_-]{16,128}$/
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/

export type DesktopLoginRequest = { app: DesktopLoginApp; state: string; challenge: string; next: string | null }

export const isDesktopLoginApp = (v: unknown): v is DesktopLoginApp => typeof v === 'string' && (DESKTOP_LOGIN_APPS as readonly string[]).includes(v)

/** Caminho do próprio HUB: começa com uma barra, nunca `//host`, `/\host` nem caractere de controle. */
export function safeLocalPath(n: string | null | undefined): string | null {
  if (!n || n.length > 2000 || !n.startsWith('/') || n.startsWith('//') || n.includes('\\')) return null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(n)) return null
  return n
}

type Raw = Record<string, string | null | undefined>
const field = (q: URLSearchParams | Raw, k: string): string | null => (q instanceof URLSearchParams ? q.get(k) : (q[k] ?? null))

/** Confere o pedido do app. `next` fora do formato vira null (o app volta ao painel); o resto inválido recusa o pedido. */
export function parseDesktopLoginRequest(q: URLSearchParams | Raw): { ok: true; req: DesktopLoginRequest } | { ok: false; message: string } {
  const app = field(q, 'app')
  if (!isDesktopLoginApp(app)) return { ok: false, message: 'App desconhecido.' }
  const state = field(q, 'state')
  if (!state || !STATE.test(state)) return { ok: false, message: 'Pedido inválido (state).' }
  const challenge = field(q, 'challenge')
  if (!challenge || !CHALLENGE.test(challenge)) return { ok: false, message: 'Pedido inválido (challenge).' }
  return { ok: true, req: { app, state, challenge, next: safeLocalPath(field(q, 'next')) } }
}

/** O deep link de volta ao app. O esquema vem da lista fechada. */
export function desktopLoginReturnUrl(app: DesktopLoginApp, code: string, state: string): string {
  if (!isDesktopLoginApp(app)) throw new DomainError('invalid_input', 'App desconhecido.')
  return `${app}://${DESKTOP_LOGIN_HOST}?${new URLSearchParams({ code, state }).toString()}`
}

/** Emite o código de uso único para a pessoa que acabou de entrar. Devolve o código em claro (só vai no deep link). */
export async function issueDesktopLoginCode(tx: Queryable, userId: string, req: DesktopLoginRequest, now = Date.now()): Promise<string> {
  const code = newToken('zd')
  await tx`
    insert into zro.desktop_login_codes (code_hash, user_id, app, state, code_challenge, next, expires_at)
    values (${hashToken(code)}, ${userId}, ${req.app}, ${req.state}, ${req.challenge}, ${req.next}, ${new Date(now + DESKTOP_LOGIN_TTL_MS)})`
  if (Math.random() < 0.05) await tx`delete from zro.desktop_login_codes where expires_at < now() - interval '1 day'`
  return code
}

export type DesktopLoginExchange = { token: string; expiresAt: Date; userId: string; next: string | null }

const bad = (reason: string) => new DomainError('unauthenticated', 'O código expirou ou já foi usado. Entre de novo.', { reason })

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * Troca o código por uma sessão do HUB. Gasta o código na primeira apresentação, mesmo que algo abaixo falhe (como no
 * /oauth/token): errar o verifier, o state ou o app queima o código. O erro volta como valor e só é lançado depois do
 * commit, senão a transação desfaria o "gasto".
 */
export async function redeemDesktopLoginCode(
  db: Database,
  input: { code: string; verifier: string; state: string; app: string },
  meta: { userAgent?: string | null; ipHash?: string | null } = {},
  now = Date.now(),
): Promise<DesktopLoginExchange> {
  if (!TOKEN_FORMAT.desktopLogin.test(input.code)) throw bad('formato')
  if (!VERIFIER.test(input.verifier)) throw bad('verifier')
  const out = await db.asSystem('auth: trocar código de entrada do app', async (tx): Promise<DesktopLoginExchange | DomainError> => {
    const [c] = await tx`select * from zro.desktop_login_codes where code_hash = ${hashToken(input.code)} for update`
    if (!c) return bad('desconhecido')
    if (c.used_at) return bad('usado')
    await tx`update zro.desktop_login_codes set used_at = now() where code_hash = ${c.code_hash as string}`
    if ((c.expires_at as Date).getTime() < now) return bad('expirado')
    if (c.app !== input.app) return bad('app')
    if (!sameText(c.state as string, input.state)) return bad('state')
    const challenge = createHash('sha256').update(input.verifier, 'utf8').digest('base64url')
    if (!sameText(c.code_challenge as string, challenge)) return bad('pkce')
    const [u] = await tx`select 1 from zro.users where id = ${c.user_id as string} and status = 'active'`
    if (!u) return bad('conta')
    const s = await createSession(tx, c.user_id as string, meta)
    return { token: s.token, expiresAt: s.expiresAt, userId: c.user_id as string, next: (c.next as string | null) ?? null }
  })
  if (out instanceof DomainError) throw out
  return out
}
