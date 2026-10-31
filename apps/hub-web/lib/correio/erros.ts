/** Erros do iCloud (IMAP e SMTP) viram mensagem clara, curta e sem detalhe técnico (o detalhe vai para o log). */
import { createLogger, DomainError, isDomainError } from '@zro/observability'

const log = createLogger('correio')

type ErroDeRede = {
  code?: string
  responseCode?: number
  authenticationFailed?: boolean
  serverResponseCode?: string
  responseText?: string
  message?: string
}

export const MENSAGEM = {
  senha: 'O iCloud recusou a senha de app. Gere outra em account.apple.com e troque ICLOUD_MAIL_APP_PASSWORD.',
  demora: 'O iCloud demorou para responder. Tente de novo.',
  fora: 'Não deu para falar com o iCloud agora. Tente de novo em instantes.',
  remetente: 'O iCloud recusou o remetente. Confira se o domínio próprio está ativo no iCloud Mail.',
  destinatario: 'O iCloud recusou um destinatário. Confira os endereços.',
  geral: 'O iCloud não respondeu como esperado. Tente de novo.',
} as const

export function motivoDoErro(e: unknown): keyof typeof MENSAGEM {
  const x = (e ?? {}) as ErroDeRede
  const texto = `${x.serverResponseCode ?? ''} ${x.responseText ?? ''} ${x.message ?? ''}`
  if (x.authenticationFailed || x.code === 'EAUTH' || /AUTHENTICATIONFAILED|authentication failed|invalid credentials/i.test(texto)) return 'senha'
  if (x.code === 'EENVELOPE' && /sender|from|mail from/i.test(texto)) return 'remetente'
  if (x.code === 'EENVELOPE') return 'destinatario'
  if (x.responseCode === 550 || x.responseCode === 553 || x.responseCode === 554) return /rcpt|recipient/i.test(texto) ? 'destinatario' : 'remetente'
  if (x.code === 'ETIMEDOUT' || x.code === 'ETIMEOUT' || x.code === 'ESOCKET' || /timed? ?out/i.test(texto)) return 'demora'
  if (
    x.code === 'ENOTFOUND' ||
    x.code === 'ECONNREFUSED' ||
    x.code === 'ECONNRESET' ||
    x.code === 'EAI_AGAIN' ||
    x.code === 'NoConnection' ||
    x.code === 'EConnectionClosed'
  )
    return 'fora'
  return 'geral'
}

/** Erro de domínio passa como está; o resto vira `upstream_unavailable` com a mensagem certa. */
export function erroDoIcloud(e: unknown, onde: 'imap' | 'smtp'): DomainError {
  if (isDomainError(e)) return e
  const motivo = motivoDoErro(e)
  const x = (e ?? {}) as ErroDeRede
  log.warn('correio.icloud_falhou', { onde, motivo, code: x.code ?? null, responseCode: x.responseCode ?? null })
  return new DomainError('upstream_unavailable', MENSAGEM[motivo], { motivo })
}
