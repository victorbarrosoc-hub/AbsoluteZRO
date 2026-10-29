import { abrirConversaSet, ESCOPO_SET, minhasConversasSet } from '@zro/core'
import { DomainError } from '@zro/observability'
import { route } from '@/lib/api'
import { corpo, paraApi, texto } from '@/lib/set'

/** GET /api/v1/set/conversas — as conversas (diretas e dos projetos) e os projetos da organização ainda sem conversa. */
export const GET = route(async ({ db, auth }) => paraApi(await minhasConversasSet(db, auth)), { bearer: ESCOPO_SET })

/**
 * POST /api/v1/set/conversas { pessoa } | { projeto } — abre (ou cria) a conversa direta com quem trabalha junto ou é
 * contato, ou a do projeto canônico (quem vê o projeto na organização ativa).
 */
export const POST = route(
  async ({ db, auth, req }) => {
    const b = await corpo(req)
    const pessoa = texto(b.pessoa)
    const projeto = texto(b.projeto)
    if (!pessoa && !projeto) throw new DomainError('invalid_input', 'Diga com quem conversar.')
    return { conversa: paraApi(await abrirConversaSet(db, auth, projeto ? { projeto } : { pessoa })) }
  },
  { bearer: ESCOPO_SET, mutation: true },
)
