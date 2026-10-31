import { denunciarSet, ESCOPO_SET } from '@zro/core'
import { DomainError } from '@zro/observability'
import { json, route } from '@/lib/api'
import { corpo, texto } from '@/lib/set'

/** POST /api/v1/set/denuncias { pessoa, mensagem?, motivo, detalhe? } — denuncia; a moderação vê no console. */
export const POST = route(
  async ({ db, auth, req }) => {
    const b = await corpo(req)
    const pessoa = texto(b.pessoa)
    if (!pessoa) throw new DomainError('invalid_input', 'Diga quem denunciar.')
    const r = await denunciarSet(db, auth, { pessoa, mensagem: texto(b.mensagem) ?? null, motivo: texto(b.motivo) ?? '', detalhe: texto(b.detalhe) ?? null })
    return json({ denuncia: r }, 201)
  },
  { bearer: ESCOPO_SET, mutation: true },
)
