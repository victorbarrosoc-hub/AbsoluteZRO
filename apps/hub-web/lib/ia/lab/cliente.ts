/**
 * Chamadas do Laboratório da Z no navegador: JSON com a mensagem de erro do HUB, a resposta da Z em NDJSON (os mesmos
 * eventos da Z: `lendo`, `texto`, `aprendizado`, e no fim `fim` ou `erro`) e a fala em PCM.
 */
import type { ZAprendizado, ZProposta } from '@zro/core'

export class ErroDoLab extends Error {
  constructor(
    message: string,
    readonly codigo: string | null,
    readonly status: number,
  ) {
    super(message)
  }
}

export async function api<T>(caminho: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...resto } = init
  const r = await fetch(`/api/v1/admin/z-lab${caminho}`, {
    ...resto,
    headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(resto.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : resto.body,
  })
  if (!r.ok) {
    const d = (await r.json().catch(() => null)) as { message?: string; error?: string } | null
    throw new ErroDoLab(d?.message ?? 'Não deu certo agora. Tente de novo.', d?.error ?? null, r.status)
  }
  return (await r.json()) as T
}

export type UsoDoTurno = { modelo: string; entrada: number; saida: number; cache: number; custoUsd: number }
/** Aprender conversando: o que a Z propôs e o que o servidor decidiu (o mesmo EventoDeAprender de lib/ia/lab/aprender.ts). */
export type EventoDeAprender =
  | { tipo: 'aprendizado'; acao: 'proposto'; proposta: ZProposta }
  | { tipo: 'aprendizado'; acao: 'salvo'; proposta: string; aprendizado: ZAprendizado; substituido: { id: string; texto: string } | null; repetido: boolean }
  | { tipo: 'aprendizado'; acao: 'ignorado'; proposta: string }
  | { tipo: 'aprendizado'; acao: 'repetido'; texto: string }
  | { tipo: 'aprendizado'; acao: 'recusado'; motivo: string; proposta?: string }
export type EventoDoLab =
  | EventoDeAprender
  | { tipo: 'lendo'; o_que: string; rotulo?: string }
  | { tipo: 'texto'; t: string }
  | { tipo: 'fim'; texto: boolean; uso: UsoDoTurno }
  | { tipo: 'erro'; mensagem: string }

/** Lê a resposta da Z linha a linha. Erro antes do streaming (teto, chave) sobe como ErroDoLab. */
export async function conversar(corpo: unknown, aoEvento: (e: EventoDoLab) => void, signal?: AbortSignal): Promise<void> {
  const r = await fetch('/api/v1/admin/z-lab/mensagens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
    signal,
  })
  if (!r.ok || !r.body) {
    const d = (await r.json().catch(() => null)) as { message?: string; error?: string } | null
    throw new ErroDoLab(d?.message ?? 'A Z não conseguiu responder agora.', d?.error ?? null, r.status)
  }
  const leitor = r.body.pipeThrough(new TextDecoderStream()).getReader()
  let resto = ''
  for (;;) {
    const { value, done } = await leitor.read()
    if (done) break
    resto += value
    let i: number
    while ((i = resto.indexOf('\n')) >= 0) {
      const linha = resto.slice(0, i).trim()
      resto = resto.slice(i + 1)
      if (!linha) continue
      try {
        aoEvento(JSON.parse(linha) as EventoDoLab)
      } catch {
        /* linha quebrada: ignora */
      }
    }
  }
}

/** Uma frase em voz: devolve o leitor do PCM para tocar enquanto chega. */
export async function falar(
  corpo: { texto: string; voz: string; modelo: string; velocidade: number; estabilidade: number; anterior?: string | null; chave: string },
  signal?: AbortSignal,
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const r = await fetch('/api/v1/admin/z-lab/fala', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), signal })
  if (!r.ok || !r.body) {
    const d = (await r.json().catch(() => null)) as { message?: string; error?: string } | null
    throw new ErroDoLab(d?.message ?? 'A voz não respondeu agora.', d?.error ?? null, r.status)
  }
  return r.body.getReader()
}

/** Transcreve PCM 16 kHz (em pedaços de até 100 s) e junta o texto. */
export async function transcrever(
  pedacos: Uint8Array[],
  opcoes: { idioma?: 'pt'; signal?: AbortSignal } = {},
): Promise<{ texto: string; segundos: number; custoUsd: number }> {
  let texto = ''
  let segundos = 0
  let custoUsd = 0
  for (const p of pedacos) {
    const q = new URLSearchParams({ chave: crypto.randomUUID() })
    if (opcoes.idioma) q.set('idioma', opcoes.idioma)
    const r = await fetch(`/api/v1/admin/z-lab/transcricao?${q}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: p as BodyInit,
      signal: opcoes.signal,
    })
    const d = (await r.json().catch(() => null)) as { texto?: string; segundos?: number; custoUsd?: number; message?: string; error?: string } | null
    if (!r.ok) throw new ErroDoLab(d?.message ?? 'A transcrição não respondeu agora.', d?.error ?? null, r.status)
    texto += (texto && d?.texto ? ' ' : '') + (d?.texto ?? '')
    segundos += d?.segundos ?? 0
    custoUsd += d?.custoUsd ?? 0
  }
  return { texto: texto.trim(), segundos, custoUsd }
}

export const usd = (v: number) =>
  v < 0.01 && v > 0 ? `US$ ${v.toFixed(4).replace('.', ',')}` : `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
