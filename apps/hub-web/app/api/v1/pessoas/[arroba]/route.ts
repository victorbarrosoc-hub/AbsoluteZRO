import { ESCOPO_PESSOAS, perfilPorArrobaParaApp } from '@zro/core'
import { DomainError } from '@zro/observability'
import { route } from '@/lib/api'
import { exigirApp, perfilParaApp } from '@/lib/pessoas'

/**
 * GET /api/v1/pessoas/@{arroba} — o perfil visível de um @ (um @ antigo dos últimos 90 dias leva ao atual, com
 * `antiga: true`). Escondido ou inexistente: o mesmo 404. Só com o token do app (escopo zro.pessoas).
 */
export const GET = route<{ arroba: string }>(
  async ({ db, auth }, { arroba }) => {
    const bruto = decodeURIComponent(arroba)
    if (!bruto.startsWith('@')) throw new DomainError('not_found', 'Não achamos esse @.')
    const r = await perfilPorArrobaParaApp(db, exigirApp(auth), bruto)
    if (!r) throw new DomainError('not_found', 'Não achamos esse @.')
    return { pessoa: perfilParaApp(r.perfil), antiga: r.antiga }
  },
  { bearer: ESCOPO_PESSOAS },
)
