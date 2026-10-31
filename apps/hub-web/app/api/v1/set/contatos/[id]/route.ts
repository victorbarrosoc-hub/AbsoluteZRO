import { ESCOPO_SET, removerContatoSet, responderContatoSet } from '@zro/core'
import { DomainError } from '@zro/observability'
import { route } from '@/lib/api'
import { corpo } from '@/lib/set'

type P = { id: string }

/** PUT /api/v1/set/contatos/{id} { acao: aceitar | recusar } — responde a um pedido recebido da pessoa {id}. */
export const PUT = route<P>(
  async ({ db, auth, req }, { id }) => {
    const b = await corpo(req)
    if (b.acao !== 'aceitar' && b.acao !== 'recusar') throw new DomainError('invalid_input', 'Aceite ou recuse.')
    return { estado: await responderContatoSet(db, auth, id, b.acao === 'aceitar') }
  },
  { bearer: ESCOPO_SET, mutation: true },
)

/** DELETE /api/v1/set/contatos/{id} — tira o contato (ou cancela o pedido enviado). */
export const DELETE = route<P>(
  async ({ db, auth }, { id }) => {
    await removerContatoSet(db, auth, id)
    return new Response(null, { status: 204 })
  },
  { bearer: ESCOPO_SET, mutation: true },
)
