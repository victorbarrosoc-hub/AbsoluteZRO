/**
 * Leitura do iCloud por IMAP (imapflow). Nada fica guardado: cada pedido abre uma conexão, busca o que precisa e fecha.
 * O cache é só da própria requisição. Toda mensagem aberta é conferida de novo contra a caixa (quem tem só
 * financeiro@ não abre uma mensagem do victor@ chutando o número).
 */
import { ImapFlow, type FetchMessageObject } from 'imapflow'
import { simpleParser, type AddressObject, type Attachment, type ParsedMail } from 'mailparser'
import type { CaixaCorreio } from '@zro/core'
import { DomainError } from '@zro/observability'
import { buscaDaCaixa, daCaixa, destinosDaMensagem } from './caixas'
import type { Endereco, Original } from './compor'
import { LIMITES, type ConfigCorreio } from './config'
import { erroDoIcloud } from './erros'
import { documentoDaMensagem, limparHtml } from './html'

export type Resumo = {
  uid: number
  de: Endereco
  assunto: string
  data: string | null
  lida: boolean
  tamanho: number
}

export type AnexoResumo = { indice: number; nome: string; tipo: string; tamanho: number }

export type Aberta = {
  uid: number
  de: Endereco[]
  para: Endereco[]
  cc: Endereco[]
  replyTo: Endereco[]
  assunto: string
  data: string | null
  /** Documento pronto para o srcdoc do iframe (nulo quando a mensagem é só texto). */
  documento: string | null
  imagensBloqueadas: number
  texto: string
  anexos: AnexoResumo[]
}

const CABECALHOS = ['from', 'subject', 'date', 'to', 'cc', 'delivered-to', 'x-original-to']

function cliente(cfg: ConfigCorreio) {
  return new ImapFlow({
    host: cfg.imap.host,
    port: cfg.imap.port,
    secure: cfg.imap.secure,
    // Teste local sem TLS: nunca tentar STARTTLS no servidor falso.
    ...(cfg.imap.secure ? {} : { doSTARTTLS: false }),
    auth: { user: cfg.usuario, pass: cfg.senha },
    logger: false,
    disableAutoIdle: true,
    disableCompression: true,
    connectionTimeout: LIMITES.conexao,
    greetingTimeout: LIMITES.saudacao,
    socketTimeout: LIMITES.socket,
    clientInfo: { name: 'Absolute ZRO Console' },
  } as ConstructorParameters<typeof ImapFlow>[0])
}

/** Abre, roda e fecha (mesmo com erro). Erro do iCloud vira mensagem clara. */
export async function comImap<T>(cfg: ConfigCorreio, fn: (c: ImapFlow) => Promise<T>): Promise<T> {
  const c = cliente(cfg)
  // Erro de socket depois do fim não derruba a função.
  c.on('error', () => {})
  try {
    await c.connect()
    return await fn(c)
  } catch (e) {
    throw erroDoIcloud(e, 'imap')
  } finally {
    await c.logout().catch(() => c.close())
  }
}

const vazio: Endereco = { nome: '', endereco: '' }

export function enderecos(a: AddressObject | AddressObject[] | undefined): Endereco[] {
  const lista = Array.isArray(a) ? a : a ? [a] : []
  const out: Endereco[] = []
  const andar = (v: { name?: string; address?: string; group?: unknown[] }[]) => {
    for (const x of v) {
      if (Array.isArray(x.group)) andar(x.group as typeof v)
      else if (x.address) out.push({ nome: (x.name ?? '').trim(), endereco: x.address.trim().toLowerCase() })
    }
  }
  for (const o of lista) andar(o.value)
  return out
}

const opcoesDoParser = { skipHtmlToText: false, skipTextToHtml: true, skipTextLinks: true, skipImageLinks: true, keepCidLinks: true } as const

/** Resumo de uma linha do INBOX a partir dos cabeçalhos buscados. */
async function resumo(m: FetchMessageObject): Promise<{ r: Resumo; destinos: string[] }> {
  const bloco = m.headers?.toString('utf8') ?? ''
  const p = await simpleParser(bloco + '\r\n', opcoesDoParser)
  const data = p.date ?? (m.internalDate ? new Date(m.internalDate) : null)
  return {
    destinos: destinosDaMensagem(bloco),
    r: {
      uid: m.uid,
      de: enderecos(p.from)[0] ?? vazio,
      assunto: p.subject ?? '',
      data: data && !Number.isNaN(data.getTime()) ? data.toISOString() : null,
      lida: m.flags?.has('\\Seen') ?? false,
      tamanho: m.size ?? 0,
    },
  }
}

/** As mensagens mais novas da caixa (até LIMITES.lista). Busca no servidor; se a busca falhar, olha as últimas 300. */
export async function listarMensagens(cfg: ConfigCorreio, caixa: CaixaCorreio): Promise<Resumo[]> {
  return comImap(cfg, async (c) => {
    const lock = await c.getMailboxLock('INBOX', { readOnly: true })
    try {
      const existe = typeof c.mailbox === 'object' ? c.mailbox.exists : 0
      if (!existe) return []
      let uids: number[] | null = null
      try {
        const achou = await c.search(buscaDaCaixa(caixa), { uid: true })
        if (Array.isArray(achou)) uids = achou
      } catch {
        uids = null
      }
      // Pede um pouco mais que a lista: a conferência exata pode tirar alguma (TO é busca por trecho).
      const faixa = uids ? [...uids].sort((a, b) => b - a).slice(0, LIMITES.lista * 2) : null
      if (faixa && !faixa.length) return []
      const range = faixa ? faixa.join(',') : `${Math.max(1, existe - LIMITES.varredura + 1)}:*`
      const msgs = await c.fetchAll(range, { uid: true, flags: true, size: true, internalDate: true, headers: CABECALHOS }, { uid: !!faixa })
      const lidas = await Promise.all(msgs.map(resumo))
      return lidas
        .filter((x) => daCaixa(x.destinos, caixa))
        .map((x) => x.r)
        .sort((a, b) => b.uid - a.uid)
        .slice(0, LIMITES.lista)
    } finally {
      lock.release()
    }
  })
}

const UID = /^[1-9]\d{0,9}$/

export function lerUid(v: unknown): number {
  const s = String(v ?? '')
  if (!UID.test(s)) throw new DomainError('not_found', 'Mensagem não encontrada.')
  return Number(s)
}

/** Busca a mensagem inteira (até o limite) e confere a caixa. Não encontrada ou de outra caixa = 404. */
async function buscarCompleta(c: ImapFlow, caixa: CaixaCorreio, uid: number): Promise<ParsedMail> {
  const meta = await c.fetchOne(String(uid), { uid: true, size: true, headers: ['to', 'cc', 'delivered-to', 'x-original-to'] }, { uid: true })
  if (!meta || !daCaixa(destinosDaMensagem(meta.headers?.toString('utf8') ?? ''), caixa)) throw new DomainError('not_found', 'Mensagem não encontrada.')
  if ((meta.size ?? 0) > LIMITES.mensagemBytes) throw new DomainError('invalid_input', 'Mensagem grande demais para abrir aqui. Abra no Mail.')
  const m = await c.fetchOne(String(uid), { uid: true, source: true }, { uid: true })
  if (!m || !m.source) throw new DomainError('not_found', 'Mensagem não encontrada.')
  return simpleParser(m.source, opcoesDoParser)
}

/** Anexos que a pessoa vê: o que não é imagem embutida no corpo. */
const visiveis = (p: ParsedMail) => p.attachments.map((a, indice) => ({ a, indice })).filter(({ a }) => !(a.related && a.contentId))

function embutidas(anexos: Attachment[]): Map<string, string> {
  const out = new Map<string, string>()
  let total = 0
  for (const a of anexos) {
    if (!a.contentId || !/^image\/(png|jpe?g|gif|webp|bmp)$/i.test(a.contentType)) continue
    total += a.size
    if (total > LIMITES.embutidasBytes) break
    out.set(a.contentId.replace(/^<|>$/g, '').toLowerCase(), `data:${a.contentType.toLowerCase()};base64,${a.content.toString('base64')}`)
  }
  return out
}

const dataIso = (d: Date | undefined) => (d && !Number.isNaN(d.getTime()) ? d.toISOString() : null)

/** Abre e marca como lida (como no Mail). */
export async function abrirMensagem(cfg: ConfigCorreio, caixa: CaixaCorreio, uid: number, opts: { imagens?: boolean } = {}): Promise<Aberta> {
  return comImap(cfg, async (c) => {
    const lock = await c.getMailboxLock('INBOX')
    try {
      const p = await buscarCompleta(c, caixa, uid)
      await c.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }).catch(() => false)
      let documento: string | null = null
      let imagensBloqueadas = 0
      if (typeof p.html === 'string' && p.html.trim()) {
        const l = limparHtml(p.html, { imagens: opts.imagens, embutidas: embutidas(p.attachments) })
        documento = documentoDaMensagem(l.html, !!opts.imagens)
        imagensBloqueadas = l.imagensBloqueadas
      }
      return {
        uid,
        de: enderecos(p.from),
        para: enderecos(p.to),
        cc: enderecos(p.cc),
        replyTo: enderecos(p.replyTo),
        assunto: p.subject ?? '',
        data: dataIso(p.date),
        documento,
        imagensBloqueadas,
        texto: (p.text ?? '').slice(0, 200_000),
        anexos: visiveis(p).map(({ a, indice }) => ({ indice, nome: nomeDoAnexo(a, indice), tipo: a.contentType, tamanho: a.size })),
      }
    } finally {
      lock.release()
    }
  })
}

export function nomeDoAnexo(a: Pick<Attachment, 'filename' | 'contentType'>, indice: number): string {
  const n = (a.filename ?? '').replace(/[\\/\r\n\t\0]+/g, ' ').trim()
  if (n) return n.slice(0, 180)
  const ext = (a.contentType.split('/')[1] ?? 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin'
  return `anexo-${indice + 1}.${ext}`
}

/** O original para montar a resposta (sem marcar nada). */
export async function lerOriginal(cfg: ConfigCorreio, caixa: CaixaCorreio, uid: number): Promise<Original> {
  return comImap(cfg, async (c) => {
    const lock = await c.getMailboxLock('INBOX', { readOnly: true })
    try {
      const p = await buscarCompleta(c, caixa, uid)
      const refs = p.references ? (Array.isArray(p.references) ? p.references : [p.references]) : []
      return {
        messageId: p.messageId ?? null,
        references: refs.flatMap((r) => r.split(/\s+/)).filter(Boolean),
        de: enderecos(p.from),
        replyTo: enderecos(p.replyTo),
        para: enderecos(p.to),
        cc: enderecos(p.cc),
        assunto: p.subject ?? '',
        data: p.date && !Number.isNaN(p.date.getTime()) ? p.date : null,
        texto: p.text ?? '',
      }
    } finally {
      lock.release()
    }
  })
}

/** Um anexo, sob demanda, com a mesma checagem de caixa. */
export async function baixarAnexo(
  cfg: ConfigCorreio,
  caixa: CaixaCorreio,
  uid: number,
  indice: number,
): Promise<{ nome: string; tipo: string; conteudo: Buffer }> {
  return comImap(cfg, async (c) => {
    const lock = await c.getMailboxLock('INBOX', { readOnly: true })
    try {
      const p = await buscarCompleta(c, caixa, uid)
      const achado = visiveis(p).find((x) => x.indice === indice)
      if (!achado) throw new DomainError('not_found', 'Anexo não encontrado.')
      if (achado.a.size > LIMITES.anexoBytes) throw new DomainError('invalid_input', 'Anexo grande demais para baixar aqui. Baixe no Mail.')
      return { nome: nomeDoAnexo(achado.a, indice), tipo: achado.a.contentType, conteudo: achado.a.content }
    } finally {
      lock.release()
    }
  })
}

/** Grava a cópia do que saiu na pasta Enviadas do iCloud ("Sent Messages"), marcada como lida. */
export async function guardarEnviada(cfg: ConfigCorreio, raw: Buffer): Promise<string> {
  return comImap(cfg, async (c) => {
    const pastas = await c.list()
    const enviadas = pastas.find((p) => p.specialUse === '\\Sent')?.path ?? 'Sent Messages'
    await c.append(enviadas, raw, ['\\Seen'], new Date())
    return enviadas
  })
}
