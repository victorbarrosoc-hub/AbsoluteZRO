import { randomUUID } from 'node:crypto'
import { abrirEscuta, adminDoLab, conferirTeto, custoEscutaUsd } from '@zro/core'
import { DomainError } from '@zro/observability'
import { json, route } from '@/lib/api'
import { tokenDaEscuta, urlDaEscuta, vozLigada } from '@/lib/ia/lab/elevenlabs'

/**
 * Abre a escuta ao vivo (Scribe v2 Realtime): o navegador recebe um token de uso único (15 min, uma conexão) e fala
 * direto com a ElevenLabs, sem ver a chave. A sessão fica aberta no uso até o navegador contar quanto durou
 * (`/escuta/fim`); antes, confere o teto com um minuto de escuta.
 *
 * Se a ElevenLabs recusar o token (ou não responder), devolve `aoVivo: false` sem abrir sessão: o navegador segue com a
 * transcrição por frase (`/transcricao`, Scribe v2), que confere o teto e registra os segundos de cada frase.
 */
export const POST = route(
  async ({ db, auth, req }) => {
    adminDoLab(auth)
    if (!vozLigada()) throw new DomainError('upstream_unavailable', 'Conecte a chave da ElevenLabs (ELEVENLABS_API_KEY).')
    const admin = await conferirTeto(db, auth, custoEscutaUsd(60))
    const escuta = await tokenDaEscuta(req.signal)
    if (!escuta.aoVivo) return json({ aoVivo: false, status: escuta.status, codigo: escuta.codigo })
    const sessao = randomUUID()
    await abrirEscuta(db, admin, sessao)
    return json({ aoVivo: true, token: escuta.token, sessao, url: urlDaEscuta(), modelo: 'scribe_v2_realtime', amostragem: 16000 })
  },
  { mutation: true },
)
