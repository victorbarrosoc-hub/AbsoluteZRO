/**
 * Separa o INBOX único do iCloud em caixas: a mensagem é da caixa quando o alias aparece em To, Cc, Delivered-To ou
 * X-Original-To (o endereço exato, sem diferenciar maiúsculas). Uma mensagem para dois aliases aparece nas duas.
 */
import addressparser, { type Address } from 'nodemailer/lib/addressparser'

/** Cabeçalhos que dizem para quem a mensagem foi. */
export const CAMPOS_DE_DESTINO = ['to', 'cc', 'delivered-to', 'x-original-to'] as const

/** Lê um bloco de cabeçalhos (com linhas dobradas) em campo → valores, com o nome do campo em minúsculas. */
export function lerCabecalhos(bloco: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const fim = bloco.search(/\r?\n\r?\n/)
  const linhas = (fim >= 0 ? bloco.slice(0, fim) : bloco).replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)
  for (const l of linhas) {
    const i = l.indexOf(':')
    if (i <= 0) continue
    const k = l.slice(0, i).trim().toLowerCase()
    if (!/^[\x21-\x39\x3b-\x7e]+$/.test(k)) continue
    out.set(k, [...(out.get(k) ?? []), l.slice(i + 1).trim()])
  }
  return out
}

function achatar(lista: Address[]): string[] {
  return lista.flatMap((a) => (a.group ? achatar(a.group) : a.address ? [a.address] : []))
}

/** Endereços (minúsculos) de um valor de cabeçalho de endereço. */
export function enderecosDe(valor: string): string[] {
  return achatar(addressparser(valor)).map((e) => e.trim().toLowerCase())
}

/** Todos os destinos de uma mensagem, a partir do bloco de cabeçalhos. */
export function destinosDaMensagem(bloco: string): string[] {
  const c = lerCabecalhos(bloco)
  return [...new Set(CAMPOS_DE_DESTINO.flatMap((k) => (c.get(k) ?? []).flatMap(enderecosDe)))]
}

export function daCaixa(destinos: string[], caixa: { endereco: string }): boolean {
  const alvo = caixa.endereco.toLowerCase()
  return destinos.some((d) => d === alvo)
}

/** Busca do servidor (IMAP SEARCH) que já traz só o que pode ser da caixa; a conferência exata fica em `daCaixa`. */
export function buscaDaCaixa(caixa: { endereco: string }): { or: { to?: string; cc?: string; header?: Record<string, string> }[] } {
  const e = caixa.endereco
  return { or: [{ to: e }, { cc: e }, { header: { 'delivered-to': e } }, { header: { 'x-original-to': e } }] }
}
