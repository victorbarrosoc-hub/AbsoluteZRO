import { adminDoLab } from '@zro/core'
import { DomainError } from '@zro/observability'
import { json, route } from '@/lib/api'
import { listarVozes, vozLigada } from '@/lib/ia/lab/elevenlabs'

/** As vozes da conta da ElevenLabs (próprias e padrão), para escolher a voz da Z. */
export const GET = route(async ({ auth, req }) => {
  adminDoLab(auth)
  if (!vozLigada()) throw new DomainError('upstream_unavailable', 'Conecte a chave da ElevenLabs (ELEVENLABS_API_KEY).')
  return json({ vozes: await listarVozes(req.signal) })
})
