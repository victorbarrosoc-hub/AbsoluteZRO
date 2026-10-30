// Laboratório da Z (ADR 0033), escuta sem a ElevenLabs ao vivo: com a ElevenLabs falsa de tests/fixtures/z-lab-falso.ts
// recusando o token da escuta (401, como em produção com a chave restrita), o HUB devolve "por frase" em vez de erro e a
// transcrição por frase (Scribe v2, pelo servidor) segue funcionando; recusada também, o erro nomeia a permissão. E o
// detector de voz (VAD) do navegador, que corta as frases, sem DOM.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { DetectorDeFala, type EventoDaFala, TAXA_ESCUTA } from '../../apps/hub-web/lib/ia/lab/audio'
import { servidorFalso } from '../fixtures/z-lab-falso'

vi.mock('server-only', () => ({}))

const PORTA = 3390 + Math.floor(Math.random() * 400)
const falso = servidorFalso(PORTA)
const ambiente = { url: process.env.ZRO_ELEVENLABS_URL, chave: process.env.ELEVENLABS_API_KEY }

beforeAll(async () => {
  await falso.abrir()
  process.env.ZRO_ELEVENLABS_URL = `http://127.0.0.1:${PORTA}/eleven`
  process.env.ELEVENLABS_API_KEY = 'chave-falsa-elevenlabs-e2e'
})
afterAll(async () => {
  await falso.fechar()
  process.env.ZRO_ELEVENLABS_URL = ambiente.url
  process.env.ELEVENLABS_API_KEY = ambiente.chave
  if (ambiente.url === undefined) delete process.env.ZRO_ELEVENLABS_URL
  if (ambiente.chave === undefined) delete process.env.ELEVENLABS_API_KEY
})

/** PCM 16 kHz: `ms` de tom (fala) ou de quase silêncio (ruído baixo). */
function trecho(ms: number, fala: boolean): Int16Array {
  const n = Math.round((ms / 1000) * TAXA_ESCUTA)
  const out = new Int16Array(n)
  for (let i = 0; i < n; i++) out[i] = fala ? Math.round(Math.sin((i / TAXA_ESCUTA) * 2 * Math.PI * 220) * 6000) : ((i * 7919) % 61) - 30
  return out
}

/** Empurra em pedaços de ~3 ms (o tamanho que o microfone manda). */
function empurrar(d: DetectorDeFala, pcm: Int16Array): EventoDaFala[] {
  const ev: EventoDaFala[] = []
  for (let i = 0; i < pcm.length; i += 43) ev.push(...d.empurrar(pcm.subarray(i, i + 43)))
  return ev
}

describe('escuta: token recusado vira transcrição por frase', () => {
  it('401 no token da escuta: devolve aoVivo false (com o código da recusa), sem lançar', async () => {
    const { tokenDaEscuta } = await import('../../apps/hub-web/lib/ia/lab/elevenlabs')
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(await tokenDaEscuta()).toEqual({ aoVivo: true, token: 'sutkn_e2e' })
    falso.recusar('token')
    try {
      expect(await tokenDaEscuta()).toEqual({ aoVivo: false, status: 401, codigo: 'invalid_api_key' })
      // O log diz o motivo, nunca a chave.
      const linhas = aviso.mock.calls.map((c) => String(c[0]))
      expect(linhas.some((l) => l.includes('"event":"elevenlabs.escuta_por_frase"') && l.includes('"status":401'))).toBe(true)
      expect(linhas.join('\n')).not.toContain('chave-falsa-elevenlabs-e2e')
    } finally {
      falso.recusar('token', false)
      aviso.mockRestore()
    }
  })

  it('por frase: a transcrição (Scribe v2, português) funciona com o token recusado', async () => {
    const { tokenDaEscuta, transcrever } = await import('../../apps/hub-web/lib/ia/lab/elevenlabs')
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    falso.recusar('token')
    try {
      expect((await tokenDaEscuta()).aoVivo).toBe(false)
      const r = await transcrever(new Uint8Array(32_000), undefined, 'pt')
      expect(r).toEqual({ texto: 'Me conta uma novidade.', idioma: 'pt' })
      const pedido = falso.registro.filter((x) => x.caminho === 'POST /eleven/v1/speech-to-text').at(-1)
      expect(pedido).toBeTruthy()
    } finally {
      falso.recusar('token', false)
      vi.restoreAllMocks()
    }
  })

  it('transcrição também recusada: o erro nomeia a permissão que falta', async () => {
    const { transcrever } = await import('../../apps/hub-web/lib/ia/lab/elevenlabs')
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    falso.recusar('token')
    falso.recusar('transcricao')
    try {
      await expect(transcrever(new Uint8Array(32_000), undefined, 'pt')).rejects.toThrow(
        'A ElevenLabs recusou a chave para Speech to Text (401, falta speech_to_text). Ligue essa permissão na chave ou confira ELEVENLABS_API_KEY.',
      )
      const linha = aviso.mock.calls.map((c) => String(c[0])).find((l) => l.includes('elevenlabs.recusou'))!
      expect(JSON.parse(linha)).toMatchObject({ servico: 'transcricao', status: 401, codigo: 'missing_permissions', permissao: 'speech_to_text' })
    } finally {
      falso.recusar('token', false)
      falso.recusar('transcricao', false)
      aviso.mockRestore()
    }
  })
})

describe('detector de voz (VAD) da escuta por frase', () => {
  it('silêncio, fala e ~700 ms de pausa: uma frase, com um pouco de antes e o fim aparado', () => {
    const d = new DetectorDeFala()
    expect(empurrar(d, trecho(600, false))).toEqual([])
    const comeco = empurrar(d, trecho(900, true))
    expect(comeco.map((e) => e.tipo)).toEqual(['inicio'])
    expect(empurrar(d, trecho(400, false))).toEqual([]) // pausa curta: a frase segue aberta
    const fim = empurrar(d, trecho(500, false))
    expect(fim).toHaveLength(1)
    const f = fim[0]!
    if (f.tipo !== 'frase') throw new Error('esperava a frase')
    expect(f.silencioMs).toBeGreaterThanOrEqual(700)
    expect(f.silencioMs).toBeLessThan(760)
    // 900 ms de fala + até 300 ms de antes + 200 ms do fim (em bytes: 32 por ms).
    const ms = f.pcm.length / 32
    expect(ms).toBeGreaterThan(900)
    expect(ms).toBeLessThanOrEqual(900 + 300 + 200 + 20)
    expect(f.pcm.length % 2).toBe(0)
    expect(d.emFala).toBe(false)
  })

  it('estalo curto não vira frase; fala longa fecha aos 30 s mesmo sem pausa', () => {
    const d = new DetectorDeFala()
    empurrar(d, trecho(500, false))
    expect(empurrar(d, trecho(60, true))).toEqual([])
    expect(empurrar(d, trecho(1200, false))).toEqual([])
    const longa = empurrar(d, trecho(31_000, true))
    // Fecha aos 30 s e, como a fala continua, abre a próxima frase.
    expect(longa.map((e) => e.tipo)).toEqual(['inicio', 'frase', 'inicio'])
    const f = longa[1]!
    expect(f.tipo === 'frase' && f.pcm.length / 32).toBeGreaterThanOrEqual(29_500)
  })

  it('fala curta demais depois de abrir (abaixo do mínimo) é descartada', () => {
    const d = new DetectorDeFala({ inicioMs: 60, minFalaMs: 400 })
    empurrar(d, trecho(500, false))
    expect(empurrar(d, trecho(200, true)).map((e) => e.tipo)).toEqual(['inicio'])
    expect(empurrar(d, trecho(900, false))).toEqual([])
    expect(d.emFala).toBe(false)
  })
})
