import { buscarPerfis, ESCOPO_PESSOAS } from '@zro/core'
import { route } from '@/lib/api'
import { exigirApp, perfilParaApp } from '@/lib/pessoas'

/**
 * GET /api/v1/pessoas/busca?q= — perfis profissionais visíveis por @ (`@fu`) ou nome, até 20, sem a própria pessoa e
 * sem e-mail ou telefone. Só com o token do app (Bearer, escopo zro.pessoas). Contrato: docs/integration-contracts/pessoas.md.
 */
export const GET = route(
  async ({ db, auth, req }) => {
    const u = new URL(req.url)
    const limite = Number(u.searchParams.get('limite') ?? 12)
    const pessoas = await buscarPerfis(db, exigirApp(auth), u.searchParams.get('q') ?? '', { limite: Number.isFinite(limite) ? limite : 12 })
    return { pessoas: pessoas.map(perfilParaApp) }
  },
  { bearer: ESCOPO_PESSOAS },
)
