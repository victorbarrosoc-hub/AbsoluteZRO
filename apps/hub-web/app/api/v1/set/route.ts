import { estadoSet, ESCOPO_SET, type Batida } from '@zro/core'
import { DomainError } from '@zro/observability'
import { route } from '@/lib/api'
import { corpo, paraApi } from '@/lib/set'

/**
 * GET /api/v1/set — o estado do Set: a pessoa e as preferências, quem da equipe e dos contatos está online (e em qual
 * app), não lidas e pedidos. POST { estado: ativo | ausente | saiu } — a batida de presença do app (o app vem do token;
 * pela central, "Absolute ZRO") e devolve o mesmo estado. Sessão do HUB ou token do app (escopo zro.set).
 * Contrato: docs/integration-contracts/set.md.
 */
export const GET = route(async ({ db, auth }) => paraApi(await estadoSet(db, auth)), { bearer: ESCOPO_SET })

const BATIDAS: Batida[] = ['ativo', 'ausente', 'saiu']

export const POST = route(
  async ({ db, auth, req }) => {
    const b = await corpo(req)
    const estado = (b.estado ?? 'ativo') as Batida
    if (!BATIDAS.includes(estado)) throw new DomainError('invalid_input', 'Estado inválido.')
    return paraApi(await estadoSet(db, auth, { batida: estado }))
  },
  { bearer: ESCOPO_SET, mutation: true },
)
