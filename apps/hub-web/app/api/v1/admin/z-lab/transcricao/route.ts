import { adminDoLab, conferirTeto, custoTranscricaoUsd, registrarUso } from '@zro/core'
import { DomainError } from '@zro/observability'
import { json, route } from '@/lib/api'
import { ESCUTA_BYTES_POR_SEGUNDO, transcrever, vozLigada } from '@/lib/ia/lab/elevenlabs'

export const maxDuration = 90

/** Um pedaço de até ~2 min (3,8 MB de PCM 16 kHz mono): cabe no corpo de uma função da Vercel. */
const MAX_BYTES = 3_800_000

/**
 * Transcrição de um pedaço do áudio de um anexo (áudio ou vídeo; o navegador tira o som e manda em pedaços). Corpo:
 * PCM 16 bits, 16 kHz, mono. `?chave=` torna o pedido idempotente (o mesmo pedaço nunca conta duas vezes); `?idioma=pt`
 * fixa o português (ditado e voz).
 */
export const POST = route(
  async ({ db, auth, req }) => {
    adminDoLab(auth)
    if (!vozLigada()) throw new DomainError('upstream_unavailable', 'Conecte a chave da ElevenLabs (ELEVENLABS_API_KEY).')
    const q = new URL(req.url).searchParams
    const chave = q.get('chave') ?? ''
    // Ditado e voz: português. Anexo: o Scribe descobre o idioma sozinho.
    const idioma = q.get('idioma') === 'pt' ? 'pt' : undefined
    if (!/^[A-Za-z0-9-]{8,80}$/.test(chave)) throw new DomainError('invalid_input', 'Chave do pedaço inválida.')
    if (Number(req.headers.get('content-length') || 0) > MAX_BYTES) throw new DomainError('invalid_input', 'Pedaço de áudio grande demais.')
    const pcm = new Uint8Array(await req.arrayBuffer())
    if (pcm.length > MAX_BYTES) throw new DomainError('invalid_input', 'Pedaço de áudio grande demais.')
    if (pcm.length < ESCUTA_BYTES_POR_SEGUNDO / 10 || pcm.length % 2) throw new DomainError('invalid_input', 'Áudio curto demais ou fora do formato.')
    const segundos = pcm.length / ESCUTA_BYTES_POR_SEGUNDO
    const custoUsd = custoTranscricaoUsd(segundos)
    const admin = await conferirTeto(db, auth, custoUsd)
    const r = await transcrever(pcm, req.signal, idioma)
    await registrarUso(db, admin, { servico: 'transcricao', modelo: 'scribe_v2', segundos, custoUsd, chave: `transcricao:${chave}` })
    return json({ ...r, segundos, custoUsd })
  },
  { mutation: true },
)
