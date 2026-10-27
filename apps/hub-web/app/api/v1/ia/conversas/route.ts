import { listarConversas, produtoDaChamada } from '@zro/core'
import { json, route } from '@/lib/api'
import { comCors, IA_ESCOPO, preflight } from '@/lib/ia/http'

/**
 * Conversas da pessoa. Um app da família (token) vê só as conversas dele; pelo HUB, todas (ou `?produto=` para uma
 * plataforma, `?produto=hub` para as do próprio HUB).
 */
const get = route(
  async ({ db, auth, req }) => {
    const viaApp = !!auth?.session.app
    const p = new URL(req.url).searchParams.get('produto')
    const produto = viaApp ? produtoDaChamada(auth) : p === null ? undefined : p === 'hub' ? null : p
    const conversas = await listarConversas(db, auth, { produto })
    return json({ conversas })
  },
  { bearer: IA_ESCOPO },
)

export const GET = async (req: Request, ctx: { params: Promise<Record<string, string>> }) => comCors(req, await get(req, ctx))
export const OPTIONS = preflight
