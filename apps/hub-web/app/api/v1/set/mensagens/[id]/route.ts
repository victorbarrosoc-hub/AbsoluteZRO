import { apagarMensagemSet, editarMensagemSet, ESCOPO_SET } from '@zro/core'
import { route } from '@/lib/api'
import { corpo } from '@/lib/set'

type P = { id: string }

/** PATCH /api/v1/set/mensagens/{id} { texto } — edita a própria mensagem nas primeiras 24 horas. */
export const PATCH = route<P>(
  async ({ db, auth, req }, { id }) => {
    await editarMensagemSet(db, auth, id, (await corpo(req)).texto)
    return new Response(null, { status: 204 })
  },
  { bearer: ESCOPO_SET, mutation: true },
)

/** DELETE /api/v1/set/mensagens/{id} — apaga a própria mensagem (fica "Mensagem apagada"). */
export const DELETE = route<P>(
  async ({ db, auth }, { id }) => {
    await apagarMensagemSet(db, auth, id)
    return new Response(null, { status: 204 })
  },
  { bearer: ESCOPO_SET, mutation: true },
)
