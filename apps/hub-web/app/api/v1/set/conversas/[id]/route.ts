import { atualizarConversaSet, ESCOPO_SET, lerConversaSet } from '@zro/core'
import { route } from '@/lib/api'
import { comEtag, corpo } from '@/lib/set'

type P = { id: string }
const num = (v: string | null) => (v !== null && /^\d{1,15}$/.test(v) ? Number(v) : undefined)

/** GET /api/v1/set/conversas/{id}?antes=&depois=&limite= — a conversa e as mensagens (a mais antiga primeiro), com ETag. */
export const GET = route<P>(
  async ({ db, auth, req }, { id }) => {
    const u = new URL(req.url)
    const r = await lerConversaSet(db, auth, id, {
      antes: num(u.searchParams.get('antes')),
      depois: num(u.searchParams.get('depois')),
      limite: num(u.searchParams.get('limite')),
    })
    return comEtag(req, r)
  },
  { bearer: ESCOPO_SET },
)

/** PATCH /api/v1/set/conversas/{id} { lidaAte?, silenciada? } — marca como lida e liga ou desliga o silêncio. */
export const PATCH = route<P>(
  async ({ db, auth, req }, { id }) => {
    const b = await corpo(req)
    await atualizarConversaSet(db, auth, id, {
      lidaAte: typeof b.lidaAte === 'number' ? b.lidaAte : undefined,
      silenciada: typeof b.silenciada === 'boolean' ? b.silenciada : undefined,
    })
    return new Response(null, { status: 204 })
  },
  { bearer: ESCOPO_SET, mutation: true },
)
