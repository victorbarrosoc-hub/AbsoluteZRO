import { adminDoLab, conferirTeto, custoDesignUsd, lerPedidoDeDesign, registrarUso, Z_DESIGN_AMOSTRAS } from '@zro/core'
import { DomainError } from '@zro/observability'
import { json, readJson, route } from '@/lib/api'
import { desenharVoz, vozLigada } from '@/lib/ia/lab/elevenlabs'

export const maxDuration = 60

/**
 * Voice Design: três amostras de uma voz nova a partir da descrição. Nada vai para a conta da ElevenLabs aqui; salvar é
 * outro pedido, com confirmação. Custo estimado pelos caracteres das amostras, conferido no teto antes.
 */
export const POST = route(
  async ({ db, auth, req }) => {
    adminDoLab(auth)
    if (!vozLigada()) throw new DomainError('upstream_unavailable', 'Conecte a chave da ElevenLabs (ELEVENLABS_API_KEY).')
    const p = lerPedidoDeDesign(await readJson(req, 6_000))
    const custoUsd = custoDesignUsd(p.texto.length)
    const admin = await conferirTeto(db, auth, custoUsd)
    const amostras = await desenharVoz(p.descricao, p.texto, req.signal)
    await registrarUso(db, admin, {
      servico: 'design',
      modelo: 'eleven_multilingual_ttv_v2',
      caracteres: p.texto.length * Z_DESIGN_AMOSTRAS,
      custoUsd,
      chave: `design:${p.chave}`,
    })
    return json({ amostras, custoUsd })
  },
  { mutation: true },
)
