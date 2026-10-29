import { abrirConversa, apagarConversa } from '@zro/core'
import { json, route } from '@/lib/api'
import { comCors, IA_ESCOPO, preflight } from '@/lib/ia/http'

type P = { id: string }

const get = route<P>(async ({ db, auth }, { id }) => json(await abrirConversa(db, auth, id)), { bearer: IA_ESCOPO })
const del = route<P>(
  async ({ db, auth }, { id }) => {
    await apagarConversa(db, auth, id)
    return new Response(null, { status: 204 })
  },
  { bearer: IA_ESCOPO, mutation: true },
)

export const GET = async (req: Request, ctx: { params: Promise<P> }) => comCors(req, await get(req, ctx))
export const DELETE = async (req: Request, ctx: { params: Promise<P> }) => comCors(req, await del(req, ctx))
export const OPTIONS = preflight
