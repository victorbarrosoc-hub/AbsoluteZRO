import { ESCOPO_AGENDA, livreOcupado } from '@zro/core'
import { route } from '@/lib/api'
import { ambienteAgenda } from '@/lib/conexoes'

/**
 * GET /api/v1/agenda/livre-ocupado?de&ate[&incluir_proprios=1] — intervalos ocupados nas agendas escolhidas (até 62
 * dias). Sem os eventos do próprio app, a menos que peça. Só com o token do app (escopo zro.agenda).
 */
export const GET = route(
  ({ db, auth, req }) => {
    const q = new URL(req.url).searchParams
    return livreOcupado(db, ambienteAgenda(), auth, { de: q.get('de'), ate: q.get('ate'), incluirProprios: q.get('incluir_proprios') === '1' })
  },
  { bearer: ESCOPO_AGENDA },
)
