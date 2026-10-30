import { ESCOPO_PESSOAS, listarComunidade } from '@zro/core'
import { route } from '@/lib/api'
import { exigirApp, perfilParaApp } from '@/lib/pessoas'

/**
 * GET /api/v1/pessoas?funcao=&depois=&limite= — a comunidade (migração 0038): perfis profissionais visíveis com o @
 * confirmado, por ordem de @, até 200 por página (`proximo` = cursor da página seguinte). Sem e-mail ou telefone.
 * Só com o token do app (Bearer, escopo zro.pessoas). Contrato: docs/integration-contracts/pessoas.md.
 */
export const GET = route(
  async ({ db, auth, req }) => {
    const u = new URL(req.url)
    const limite = Number(u.searchParams.get('limite') ?? 100)
    const r = await listarComunidade(db, exigirApp(auth), {
      funcao: u.searchParams.get('funcao'),
      depois: u.searchParams.get('depois'),
      limite: Number.isFinite(limite) ? limite : 100,
    })
    return { pessoas: r.pessoas.map(perfilParaApp), proximo: r.proximo }
  },
  { bearer: ESCOPO_PESSOAS },
)
