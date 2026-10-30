import { randomUUID } from 'node:crypto'
import { abrirEscuta, adminDoLab, conferirTeto, custoEscutaUsd } from '@zro/core'
import { DomainError } from '@zro/observability'
import { json, route } from '@/lib/api'
import { tokenDaEscuta, urlDaEscuta, vozLigada } from '@/lib/ia/lab/elevenlabs'

/**
 * Abre a escuta ao vivo (Scribe v2 Realtime): o navegador recebe um token de uso único (15 min, uma conexão) e fala
 * direto com a ElevenLabs, sem ver a chave. A sessão fica aberta no uso até o navegador contar quanto durou
 * (`/escuta/fim`); antes, confere o teto com um minuto de escuta.
 */
export const POST = route(
  async ({ db, auth, req }) => {
    adminDoLab(auth)
    if (!vozLigada()) throw new DomainError('upstream_unavailable', 'Conecte a chave da ElevenLabs (ELEVENLABS_API_KEY).')
    const admin = await conferirTeto(db, auth, custoEscutaUsd(60))
    const token = await tokenDaEscuta(req.signal)
    const sessao = randomUUID()
    await abrirEscuta(db, admin, sessao)
    return json({ token, sessao, url: urlDaEscuta(), modelo: 'scribe_v2_realtime', amostragem: 16000 })
  },
  { mutation: true },
)
