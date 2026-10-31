/**
 * Correio do console (ADR 0034): as três caixas do domínio próprio são aliases de UMA conta iCloud Mail. O HUB fala com
 * o iCloud por IMAP (imap.mail.me.com:993, TLS) e SMTP (smtp.mail.me.com:587, STARTTLS) com a senha específica de app.
 * As variáveis são só do servidor (nunca NEXT_PUBLIC_). Sem elas, a tela diz "Correio não configurado".
 *
 * Nos testes, ZRO_CORREIO_TESTE_IMAP / ZRO_CORREIO_TESTE_SMTP (host:porta) trocam o iCloud por um servidor falso local,
 * sem TLS. Só valem com host de loopback e fora de produção.
 */
import { zroEnv } from '@zro/observability'

export const VARIAVEIS_CORREIO = { usuario: 'ICLOUD_MAIL_USER', senha: 'ICLOUD_MAIL_APP_PASSWORD' } as const

export type ServidorImap = { host: string; port: number; secure: boolean }
export type ServidorSmtp = { host: string; port: number; secure: boolean; requireTLS: boolean; ignoreTLS: boolean }
export type ConfigCorreio = { usuario: string; senha: string; imap: ServidorImap; smtp: ServidorSmtp; teste: boolean }

export const ICLOUD_IMAP: ServidorImap = { host: 'imap.mail.me.com', port: 993, secure: true }
export const ICLOUD_SMTP: ServidorSmtp = { host: 'smtp.mail.me.com', port: 587, secure: false, requireTLS: true, ignoreTLS: false }

/** Limites para caber numa função da Vercel (tempo e tamanho de resposta). */
export const LIMITES = {
  /** Mensagens na lista de cada caixa (as mais novas). */
  lista: 50,
  /** Quantas mensagens do INBOX olhar quando a busca do servidor falha. */
  varredura: 300,
  /** Mensagem maior que isto não abre aqui (abre no Mail). */
  mensagemBytes: 10 * 1024 * 1024,
  /** Anexo maior que isto não passa pelo servidor (a resposta da Vercel tem teto de 4,5 MB). */
  anexoBytes: 4 * 1024 * 1024,
  /** Imagens embutidas (cid:) viram data: até este total; acima, ficam de fora. */
  embutidasBytes: 2 * 1024 * 1024,
  /** Tempos de rede (ms). */
  conexao: 8_000,
  saudacao: 8_000,
  socket: 20_000,
  /** Texto de uma resposta ou e-mail novo. */
  textoCaracteres: 100_000,
  destinatarios: 20,
  assuntoCaracteres: 300,
} as const

const LOOPBACK = /^(127\.0\.0\.1|localhost|\[?::1\]?)$/

function servidorDeTeste(v: string | undefined): { host: string; port: number } | null {
  const m = /^([^:]+|\[[^\]]+\]):(\d{2,5})$/.exec((v ?? '').trim())
  if (!m || !LOOPBACK.test(m[1]!)) return null
  return { host: m[1]!.replace(/^\[|\]$/g, ''), port: Number(m[2]) }
}

/** Lê o ambiente. `faltam` lista os nomes ausentes, na ordem da tela; `config` é nulo enquanto faltar algo. */
export function configDoCorreio(env: Record<string, string | undefined>): { config: ConfigCorreio | null; faltam: string[] } {
  const usuario = env[VARIAVEIS_CORREIO.usuario]?.trim() ?? ''
  // A Apple mostra a senha de app com hífens (abcd-efgh-ijkl-mnop); espaços colados por engano saem.
  const senha = (env[VARIAVEIS_CORREIO.senha] ?? '').replace(/\s+/g, '')
  const faltam: string[] = []
  if (!usuario.includes('@')) faltam.push(VARIAVEIS_CORREIO.usuario)
  if (!senha) faltam.push(VARIAVEIS_CORREIO.senha)
  if (faltam.length) return { config: null, faltam }
  const producao = zroEnv(env as NodeJS.ProcessEnv) === 'production'
  const imapTeste = producao ? null : servidorDeTeste(env.ZRO_CORREIO_TESTE_IMAP)
  const smtpTeste = producao ? null : servidorDeTeste(env.ZRO_CORREIO_TESTE_SMTP)
  return {
    faltam,
    config: {
      usuario,
      senha,
      imap: imapTeste ? { ...imapTeste, secure: false } : ICLOUD_IMAP,
      smtp: smtpTeste ? { ...smtpTeste, secure: false, requireTLS: false, ignoreTLS: true } : ICLOUD_SMTP,
      teste: Boolean(imapTeste || smtpTeste),
    },
  }
}
