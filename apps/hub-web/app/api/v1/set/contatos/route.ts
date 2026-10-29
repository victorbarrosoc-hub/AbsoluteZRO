import { ESCOPO_SET, meusContatosSet, pedirContatoSet } from '@zro/core'
import { DomainError } from '@zro/observability'
import { json, route } from '@/lib/api'
import { corpo, paraApi, texto } from '@/lib/set'

/** GET /api/v1/set/contatos — contatos, pedidos recebidos e enviados e bloqueados (nome, @ e foto, nada mais). */
export const GET = route(async ({ db, auth }) => paraApi(await meusContatosSet(db, auth)), { bearer: ESCOPO_SET })

/**
 * POST /api/v1/set/contatos { arroba } | { pessoa } — pede contato (perfil visível pelo @, ou alguém do Set pelo id). Se a
 * outra pessoa já tinha pedido, vira contato na hora (estado: aceito). 20 pedidos por dia.
 */
export const POST = route(
  async ({ db, auth, req }) => {
    const b = await corpo(req)
    const arroba = texto(b.arroba)
    const pessoa = texto(b.pessoa)
    if (!arroba && !pessoa) throw new DomainError('invalid_input', 'Diga o @ da pessoa.')
    const r = await pedirContatoSet(db, auth, arroba ? { arroba } : { id: pessoa })
    return json(paraApi(r), 201)
  },
  { bearer: ESCOPO_SET, mutation: true },
)
