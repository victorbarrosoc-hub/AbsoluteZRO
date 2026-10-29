import { ESCOPO_AGENDA, eventosDaAgenda } from '@zro/core'
import { route } from '@/lib/api'
import { ambienteAgenda } from '@/lib/conexoes'

/** GET /api/v1/agenda/eventos?de&ate — eventos com campos mínimos (até 62 dias, 500 no máximo). Escopo zro.agenda. */
export const GET = route(
  ({ db, auth, req }) => {
    const q = new URL(req.url).searchParams
    return eventosDaAgenda(db, ambienteAgenda(), auth, { de: q.get('de'), ate: q.get('ate') })
  },
  { bearer: ESCOPO_AGENDA },
)
