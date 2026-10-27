import { IA_METRICA, produtoDaChamada, requireUser } from '@zro/core'
import { peekQuota } from '@zro/billing'
import { json, route } from '@/lib/api'
import { comCors, IA_ESCOPO, preflight } from '@/lib/ia/http'
import { iaLigada } from '@/lib/ia/modelo'

/** Para abrir o painel da IA: se está ligada, o primeiro nome (saudação), a plataforma e os créditos do mês. */
const get = route(
  async ({ db, auth }) => {
    const { auth: a } = requireUser(auth)
    const orgId = a.session.activeOrgId
    const q = orgId ? await db.asSystem('ia: créditos', (tx) => peekQuota(tx, orgId, IA_METRICA, 0)) : null
    return json({
      ligada: iaLigada(),
      nome: a.user.displayName.split(/\s+/)[0] ?? a.user.displayName,
      produto: produtoDaChamada(a),
      creditos: q ? { usados: q.used, limite: q.limit, renova_em: q.periodEnd.toISOString() } : null,
    })
  },
  { bearer: IA_ESCOPO },
)

export const GET = async (req: Request, ctx: { params: Promise<Record<string, string>> }) => comCors(req, await get(req, ctx))
export const OPTIONS = preflight
