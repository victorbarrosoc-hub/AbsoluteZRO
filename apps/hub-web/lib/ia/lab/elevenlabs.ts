import 'server-only'
/**
 * ElevenLabs no Laboratório da Z (ADR 0033): voz (texto → fala em streaming), transcrição de arquivo (Scribe v2) e o
 * token de uso único da escuta ao vivo (Scribe v2 Realtime, aberta pelo navegador). A chave é a do HUB
 * (`ELEVENLABS_API_KEY`), só no servidor: nunca vai para o navegador, para o log ou para o banco.
 * Endpoints conferidos na documentação oficial (out/2026):
 *   GET  /v2/voices · POST /v1/text-to-speech/{voz}/stream · POST /v1/speech-to-text · POST /v1/single-use-token/realtime_scribe
 *   POST /v1/text-to-voice/design (amostras) · POST /v1/text-to-voice (salva a amostra escolhida como voz da conta)
 *   wss://api.elevenlabs.io/v1/speech-to-text/realtime (com ?token=)
 * `ZRO_ELEVENLABS_URL` e `ZRO_ELEVENLABS_WS_URL` só existem nos testes (a ElevenLabs falsa do e2e).
 */
import { classificarVoz } from '@zro/core'
import { DomainError, zroEnv } from '@zro/observability'

// Endereço falso só fora de produção (a chave nunca vai para outro lugar).
const teste = (v: string | undefined) => (zroEnv() !== 'production' ? v : undefined)
const base = () => (teste(process.env.ZRO_ELEVENLABS_URL) || 'https://api.elevenlabs.io').replace(/\/$/, '')
export const urlDaEscuta = () => (teste(process.env.ZRO_ELEVENLABS_WS_URL) || 'wss://api.elevenlabs.io').replace(/\/$/, '') + '/v1/speech-to-text/realtime'
export const vozLigada = () => !!process.env.ELEVENLABS_API_KEY

/** Amostragem da fala que o laboratório toca (PCM 16 bits, mono): começa a tocar no primeiro pedaço. */
export const FALA_AMOSTRAGEM = 24_000
/** Áudio que o navegador manda para a transcrição: PCM 16 bits, 16 kHz, mono (32 mil bytes por segundo). */
export const ESCUTA_BYTES_POR_SEGUNDO = 32_000

function chave(): string {
  const k = process.env.ELEVENLABS_API_KEY?.trim()
  if (!k) throw new DomainError('upstream_unavailable', 'Conecte a chave da ElevenLabs (ELEVENLABS_API_KEY).')
  return k
}

/** O que cada chamada usa da chave: diz qual permissão ligar na ElevenLabs quando ela recusa. */
type Servico = 'vozes' | 'fala' | 'transcricao' | 'escuta' | 'desenho' | 'salvar-voz'
const PERMISSAO: Record<Servico, string> = {
  vozes: 'Voices (ler)',
  fala: 'Text to Speech',
  transcricao: 'Speech to Text',
  escuta: 'Speech to Text (tempo real)',
  desenho: 'Voice Generation',
  'salvar-voz': 'Voices (escrever)',
}

async function falha(r: Response, servico: Servico): Promise<never> {
  // Só o status: o corpo pode ecoar dados do pedido, e nada da chave vai para o log.
  if (r.status === 401 || r.status === 403) {
    console.warn(JSON.stringify({ scope: 'z-lab', event: 'elevenlabs.recusou', servico, status: r.status }))
    throw new DomainError(
      'upstream_unavailable',
      `A ElevenLabs recusou a chave para ${PERMISSAO[servico]} (${r.status}). Ligue essa permissão na chave ou confira ELEVENLABS_API_KEY.`,
    )
  }
  if (r.status === 429) throw new DomainError('rate_limited', 'A ElevenLabs pediu calma. Tente de novo em instantes.')
  if (r.status === 422) throw new DomainError('invalid_input', 'A ElevenLabs não aceitou o pedido (voz ou áudio inválido).')
  throw new DomainError('upstream_unavailable', `A ElevenLabs não respondeu agora (${r.status}).`)
}

export type Voz = { id: string; nome: string; categoria: string | null; previa: string | null; rotulos: string[]; feminina: boolean; ptBr: boolean }

let cacheVozes: { em: number; vozes: Voz[] } | null = null

/** As vozes da conta (as próprias e as padrão), até 200, guardadas 5 minutos na memória. */
export async function listarVozes(signal?: AbortSignal): Promise<Voz[]> {
  if (cacheVozes && Date.now() - cacheVozes.em < 5 * 60_000) return cacheVozes.vozes
  const vozes: Voz[] = []
  let pagina: string | null = null
  for (let i = 0; i < 2; i++) {
    const q = new URLSearchParams({ page_size: '100', include_total_count: 'false' })
    if (pagina) q.set('next_page_token', pagina)
    const r = await fetch(`${base()}/v2/voices?${q}`, { headers: { 'xi-api-key': chave() }, signal, cache: 'no-store' })
    if (!r.ok) await falha(r, 'vozes')
    const d = (await r.json()) as {
      voices: {
        voice_id: string
        name?: string
        category?: string
        preview_url?: string | null
        labels?: Record<string, string>
        verified_languages?: { language?: string; accent?: string | null; locale?: string | null }[]
      }[]
      has_more?: boolean
      next_page_token?: string | null
    }
    for (const v of d.voices ?? []) {
      if (!/^[A-Za-z0-9]{8,40}$/.test(v.voice_id)) continue
      vozes.push({
        id: v.voice_id,
        nome: (v.name ?? v.voice_id).slice(0, 80),
        categoria: v.category ?? null,
        previa: v.preview_url && /^https:\/\//.test(v.preview_url) ? v.preview_url : null,
        rotulos: Object.values(v.labels ?? {})
          .filter((x) => typeof x === 'string')
          .slice(0, 4),
        ...classificarVoz(v),
      })
    }
    if (!d.has_more || !d.next_page_token) break
    pagina = d.next_page_token
  }
  cacheVozes = { em: Date.now(), vozes }
  return vozes
}

export type Fala = { texto: string; voz: string; modelo: string; velocidade: number; estabilidade: number; anterior?: string | null }

/** Texto → fala em streaming (PCM 24 kHz). Devolve o corpo da resposta para repassar ao navegador sem esperar o fim. */
export async function falar(f: Fala, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  const r = await fetch(`${base()}/v1/text-to-speech/${encodeURIComponent(f.voz)}/stream?output_format=pcm_${FALA_AMOSTRAGEM}`, {
    method: 'POST',
    headers: { 'xi-api-key': chave(), 'Content-Type': 'application/json', Accept: 'audio/pcm' },
    body: JSON.stringify({
      text: f.texto,
      model_id: f.modelo,
      language_code: f.modelo === 'eleven_multilingual_v2' ? undefined : 'pt',
      previous_text: f.anterior || undefined,
      voice_settings: { stability: f.estabilidade, similarity_boost: 0.75, speed: f.velocidade, use_speaker_boost: true },
    }),
    signal,
  })
  if (!r.ok || !r.body) await falha(r, 'fala')
  return r.body!
}

/** Transcrição de um pedaço de áudio (PCM 16 kHz mono) pelo Scribe v2. */
export async function transcrever(pcm: Uint8Array, signal?: AbortSignal, idioma?: 'pt'): Promise<{ texto: string; idioma: string | null }> {
  const form = new FormData()
  form.set('model_id', 'scribe_v2')
  form.set('file_format', 'pcm_s16le_16')
  form.set('tag_audio_events', 'false')
  if (idioma) form.set('language_code', idioma)
  form.set('file', new Blob([pcm as BlobPart], { type: 'application/octet-stream' }), 'audio.pcm')
  const r = await fetch(`${base()}/v1/speech-to-text`, { method: 'POST', headers: { 'xi-api-key': chave() }, body: form, signal })
  if (!r.ok) await falha(r, 'transcricao')
  const d = (await r.json()) as { text?: string; language_code?: string | null }
  return { texto: (d.text ?? '').trim(), idioma: d.language_code ?? null }
}

/** Token de uso único (vale 15 min, uma conexão) para o navegador abrir a escuta ao vivo sem ver a chave. */
export async function tokenDaEscuta(signal?: AbortSignal): Promise<string> {
  const r = await fetch(`${base()}/v1/single-use-token/realtime_scribe`, { method: 'POST', headers: { 'xi-api-key': chave() }, signal })
  if (!r.ok) await falha(r, 'escuta')
  const d = (await r.json()) as { token?: string }
  if (!d.token) throw new DomainError('upstream_unavailable', 'A ElevenLabs não devolveu o token da escuta.')
  return d.token
}

export type Amostra = { id: string; audio: string; mime: string; segundos: number }

/**
 * Voice Design: três amostras de uma voz nova a partir da descrição. Nada é salvo na conta ainda; a amostra escolhida
 * só vira voz com `criarVoz`, depois da confirmação do titular.
 */
export async function desenharVoz(descricao: string, texto: string, signal?: AbortSignal): Promise<Amostra[]> {
  const r = await fetch(`${base()}/v1/text-to-voice/design?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': chave(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ voice_description: descricao, text: texto, model_id: 'eleven_multilingual_ttv_v2' }),
    signal,
  })
  if (!r.ok) await falha(r, 'desenho')
  const d = (await r.json()) as { previews?: { generated_voice_id?: string; audio_base_64?: string; media_type?: string; duration_secs?: number }[] }
  return (d.previews ?? [])
    .filter((p) => typeof p.generated_voice_id === 'string' && /^[A-Za-z0-9_-]{6,80}$/.test(p.generated_voice_id) && typeof p.audio_base_64 === 'string')
    .slice(0, 3)
    .map((p) => ({
      id: p.generated_voice_id!,
      audio: p.audio_base_64!,
      mime: /^audio\/[a-z0-9.+-]+$/.test(p.media_type ?? '') ? p.media_type! : 'audio/mpeg',
      segundos: Number(p.duration_secs ?? 0),
    }))
}

/** Salva a amostra escolhida como voz da conta da ElevenLabs. */
export async function criarVoz(p: { amostra: string; nome: string; descricao: string }, signal?: AbortSignal): Promise<{ id: string; nome: string }> {
  const r = await fetch(`${base()}/v1/text-to-voice`, {
    method: 'POST',
    headers: { 'xi-api-key': chave(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      voice_name: p.nome,
      voice_description: p.descricao,
      generated_voice_id: p.amostra,
      labels: { gender: 'female', accent: 'brazilian', language: 'pt' },
    }),
    signal,
  })
  if (!r.ok) await falha(r, 'salvar-voz')
  const d = (await r.json()) as { voice_id?: string; name?: string }
  if (!d.voice_id || !/^[A-Za-z0-9]{8,40}$/.test(d.voice_id)) throw new DomainError('upstream_unavailable', 'A ElevenLabs não devolveu a voz nova.')
  cacheVozes = null
  return { id: d.voice_id, nome: (d.name ?? p.nome).slice(0, 80) }
}
