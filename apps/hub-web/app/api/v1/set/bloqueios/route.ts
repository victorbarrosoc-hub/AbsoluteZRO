import { bloquearSet, ESCOPO_SET } from '@zro/core'
import { DomainError } from '@zro/observability'
import { route } from '@/lib/api'
import { corpo, texto } from '@/lib/set'

/** POST /api/v1/set/bloqueios { pessoa } — bloqueia: some presença, contato e mensagens nos dois sentidos. */
export const POST = route(
  async ({ db, auth, req }) => {
    const pessoa = texto((await corpo(req)).pessoa)
    if (!pessoa) throw new DomainError('invalid_input', 'Diga quem bloquear.')
    await bloquearSet(db, auth, pessoa)
    return new Response(null, { status: 204 })
  },
  { bearer: ESCOPO_SET, mutation: true },
)
