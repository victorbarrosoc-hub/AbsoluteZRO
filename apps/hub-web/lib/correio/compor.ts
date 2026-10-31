/**
 * Monta o que sai do Correio (ADR 0034). From é sempre o alias da caixa (nunca o Apple ID); Reply-To também, para a
 * resposta voltar à mesma caixa. Na resposta: To = Reply-To do original (ou From), assunto com "Re:", In-Reply-To = o
 * Message-ID do original e References = os do original + ele. O MIME sai do MailComposer do nodemailer, uma vez só: o
 * mesmo texto vai ao SMTP e à pasta Enviadas.
 */
import { randomUUID } from 'node:crypto'
import addressparser, { type Address } from 'nodemailer/lib/addressparser'
import MailComposer from 'nodemailer/lib/mail-composer'
import { CAIXAS_CORREIO, type CaixaCorreio } from '@zro/core'
import { DomainError } from '@zro/observability'
import { LIMITES } from './config'

export type Endereco = { nome: string; endereco: string }

export type Original = {
  messageId: string | null
  references: string[]
  de: Endereco[]
  replyTo: Endereco[]
  para: Endereco[]
  cc: Endereco[]
  assunto: string
  data: Date | null
  texto: string
}

export type Saida = {
  de: Endereco
  replyTo: Endereco
  para: Endereco[]
  cc: Endereco[]
  assunto: string
  texto: string
  inReplyTo: string | null
  references: string[]
}

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/
const ID = /^<[^<>\s]{1,250}>$/

/** Remetente que a caixa mostra. */
export const remetente = (c: CaixaCorreio): Endereco => ({ nome: 'Absolute ZRO', endereco: c.endereco })

const semQuebra = (s: string) => s.replace(/[\r\n\t]+/g, ' ').trim()

function achatar(lista: Address[]): Endereco[] {
  return lista.flatMap((a) => (a.group ? achatar(a.group) : [{ nome: semQuebra(a.name ?? ''), endereco: (a.address ?? '').trim().toLowerCase() }]))
}

/** Lê uma lista digitada ("a@x.com, Fulano <b@y.com>"). Endereço inválido = erro com o próprio endereço. */
export function lerDestinatarios(texto: string, campo: string): Endereco[] {
  const lista = achatar(addressparser(texto ?? ''))
  for (const e of lista) {
    if (!EMAIL.test(e.endereco)) throw new DomainError('invalid_input', `${campo}: endereço inválido${e.endereco ? ` (${e.endereco})` : ''}.`)
  }
  const unicos = new Map<string, Endereco>()
  for (const e of lista) if (!unicos.get(e.endereco)?.nome) unicos.set(e.endereco, e)
  return [...unicos.values()]
}

function conferir(s: Pick<Saida, 'para' | 'cc' | 'assunto' | 'texto'>) {
  if (!s.para.length) throw new DomainError('invalid_input', 'Para quem? Informe ao menos um endereço.')
  if (s.para.length + s.cc.length > LIMITES.destinatarios) throw new DomainError('invalid_input', `No máximo ${LIMITES.destinatarios} destinatários.`)
  if (s.assunto.length > LIMITES.assuntoCaracteres) throw new DomainError('invalid_input', 'Assunto longo demais.')
  if (!s.texto.trim()) throw new DomainError('invalid_input', 'Escreva a mensagem.')
  if (s.texto.length > LIMITES.textoCaracteres) throw new DomainError('invalid_input', 'Mensagem longa demais.')
}

/** E-mail novo, saindo da caixa escolhida. */
export function montarNova(caixa: CaixaCorreio, campos: { para: string; cc?: string; assunto: string; texto: string }): Saida {
  const s: Saida = {
    de: remetente(caixa),
    replyTo: remetente(caixa),
    para: lerDestinatarios(campos.para, 'Para'),
    cc: lerDestinatarios(campos.cc ?? '', 'Cc'),
    assunto: semQuebra(campos.assunto ?? ''),
    texto: (campos.texto ?? '').replace(/\r\n?/g, '\n'),
    inReplyTo: null,
    references: [],
  }
  conferir(s)
  return s
}

export const assuntoDeResposta = (assunto: string) => {
  const a = semQuebra(assunto)
  return /^(re|res|resp)\s*:/i.test(a) ? a : `Re: ${a || '(sem assunto)'}`
}

const fmtData = (d: Date) =>
  d.toLocaleString('pt-BR', { timeZone: 'America/Fortaleza', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** O original citado embaixo da resposta (até 20 mil caracteres). */
export function citacao(o: Original): string {
  const quem = o.de[0] ? (o.de[0].nome ? `${o.de[0].nome} <${o.de[0].endereco}>` : o.de[0].endereco) : 'alguém'
  const quando = o.data ? `Em ${fmtData(o.data)}, ` : ''
  const corpo = o.texto.replace(/\r\n?/g, '\n').slice(0, 20_000).trimEnd()
  return `${quando}${quem} escreveu:\n${corpo
    .split('\n')
    .map((l) => `> ${l}`.trimEnd())
    .join('\n')}`
}

/**
 * Resposta a partir da caixa certa. `todos`: também quem estava em To/Cc (menos os aliases da casa e quem já vai em To).
 */
export function montarResposta(caixa: CaixaCorreio, o: Original, campos: { texto: string; todos?: boolean }): Saida {
  const casa = new Set<string>(CAIXAS_CORREIO.map((c) => c.endereco))
  const para = (o.replyTo.length ? o.replyTo : o.de).filter((e) => EMAIL.test(e.endereco) && !casa.has(e.endereco))
  const jaVai = new Set(para.map((e) => e.endereco))
  const cc = campos.todos ? [...o.para, ...o.cc].filter((e) => EMAIL.test(e.endereco) && !casa.has(e.endereco) && !jaVai.has(e.endereco)) : []
  const unicosCc = [...new Map(cc.map((e) => [e.endereco, e])).values()]
  const messageId = o.messageId && ID.test(o.messageId) ? o.messageId : null
  const refs = [...o.references.filter((r) => ID.test(r)), ...(messageId ? [messageId] : [])]
  const texto = (campos.texto ?? '').replace(/\r\n?/g, '\n').trimEnd()
  const s: Saida = {
    de: remetente(caixa),
    replyTo: remetente(caixa),
    para,
    cc: unicosCc,
    assunto: assuntoDeResposta(o.assunto),
    texto: texto ? `${texto}\n\n${citacao(o)}\n` : '',
    inReplyTo: messageId,
    // Sem crescer sem fim: o primeiro (a raiz da conversa) e os 19 mais recentes.
    references: [...new Set(refs.length > 20 ? [refs[0]!, ...refs.slice(-19)] : refs)],
  }
  if (!texto) throw new DomainError('invalid_input', 'Escreva a resposta.')
  if (!para.length) throw new DomainError('invalid_input', 'O original não tem para quem responder.')
  conferir(s)
  return s
}

const formatar = (e: Endereco) => ({ name: e.nome, address: e.endereco })

/** O MIME pronto (o mesmo vai ao SMTP e à pasta Enviadas), com o Message-ID gerado aqui. */
export async function gerarMime(
  s: Saida,
  opts: { data?: Date; messageId?: string } = {},
): Promise<{ raw: Buffer; messageId: string; envelope: { from: string; to: string[] } }> {
  const dominio = s.de.endereco.split('@')[1] ?? 'absolutezro.com'
  const messageId = opts.messageId ?? `<${randomUUID()}@${dominio}>`
  const mail = new MailComposer({
    from: formatar(s.de),
    replyTo: formatar(s.replyTo),
    to: s.para.map(formatar),
    cc: s.cc.length ? s.cc.map(formatar) : undefined,
    subject: s.assunto,
    text: s.texto,
    messageId,
    date: opts.data ?? new Date(),
    inReplyTo: s.inReplyTo ?? undefined,
    references: s.references.length ? s.references : undefined,
    headers: { 'X-Mailer': 'Absolute ZRO Console' },
  })
  const raw = await new Promise<Buffer>((ok, falha) => mail.compile().build((err, msg) => (err ? falha(err) : ok(msg))))
  return { raw, messageId, envelope: { from: s.de.endereco, to: [...s.para, ...s.cc].map((e) => e.endereco) } }
}
