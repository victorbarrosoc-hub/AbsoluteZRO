import { adminDoLab, conferirTeto, custoVozUsd, lerPedidoDeFala, registrarUso } from '@zro/core'
import { DomainError } from '@zro/observability'
import { readJson, route } from '@/lib/api'
import { FALA_AMOSTRAGEM, falar, vozLigada } from '@/lib/ia/lab/elevenlabs'

export const maxDuration = 60

/**
 * Um trecho da resposta da Z em voz (ElevenLabs, streaming): PCM 16 bits mono a 24 kHz, repassado pedaço a pedaço para
 * o navegador começar a tocar no primeiro. O custo sai dos caracteres e conta antes de chamar (idempotente pela chave).
 */
export const POST = route(
  async ({ db, auth, req }) => {
    adminDoLab(auth)
    if (!vozLigada()) throw new DomainError('upstream_unavailable', 'Conecte a chave da ElevenLabs (ELEVENLABS_API_KEY).')
    const f = lerPedidoDeFala(await readJson(req, 8_000))
    const custoUsd = custoVozUsd(f.texto.length, f.modelo)
    const admin = await conferirTeto(db, auth, custoUsd)
    const audio = await falar(f, req.signal)
    await registrarUso(db, admin, { servico: 'voz', modelo: f.modelo, caracteres: f.texto.length, custoUsd, chave: `voz:${f.chave}` })
    return new Response(audio, {
      headers: { 'Content-Type': 'audio/pcm', 'X-Amostragem': String(FALA_AMOSTRAGEM), 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' },
    })
  },
  { mutation: true },
)
