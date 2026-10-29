import { ESCOPO_AGENDA, estadoDaAgenda } from '@zro/core'
import { route } from '@/lib/api'
import { ambienteAgenda } from '@/lib/conexoes'

/**
 * GET /api/v1/agenda/conexao — como está o Google Agenda da pessoa para este app (conectada, conta, app ligado e o
 * endereço de /conexoes). Só com o token do app (Bearer, escopo zro.agenda). Contrato: docs/integration-contracts/agenda.md.
 */
export const GET = route(({ db, auth }) => estadoDaAgenda(db, ambienteAgenda(), auth), { bearer: ESCOPO_AGENDA })
