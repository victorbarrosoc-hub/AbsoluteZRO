import { apagarEvento, ESCOPO_AGENDA, gravarEvento } from '@zro/core'
import { json, readJson, route } from '@/lib/api'
import { ambienteAgenda } from '@/lib/conexoes'

/**
 * PUT /api/v1/agenda/eventos/{app}/{ref} — grava (cria ou atualiza) o evento do app, idempotente por (app, ref).
 * DELETE — apaga (204 mesmo se já não existia). `{app}` tem de ser o app do token; um app só mexe no que é dele.
 * Só com o token do app (Bearer, escopo zro.agenda). Contrato: docs/integration-contracts/agenda.md.
 */
export const PUT = route<{ app: string; ref: string }>(
  async ({ db, auth, req }, p) => {
    const r = await gravarEvento(db, ambienteAgenda(), auth, p, await readJson(req, 16_000))
    return json(r, r.criado ? 201 : 200)
  },
  { bearer: ESCOPO_AGENDA, mutation: true },
)

export const DELETE = route<{ app: string; ref: string }>(
  async ({ db, auth }, p) => {
    await apagarEvento(db, ambienteAgenda(), auth, p)
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
  },
  { bearer: ESCOPO_AGENDA, mutation: true },
)
