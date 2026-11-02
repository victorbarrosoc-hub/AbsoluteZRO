import { meusLimites } from '@zro/core'
import { json, route } from '@/lib/api'
import { comCors, preflight } from '@/lib/ia/http'

/**
 * Nível e limites efetivos da pessoa (ADR 0039): pela sessão do HUB ou pelo token do login único de um app (escopo
 * `org`, organização do token). Sem cache: muda com teste, assinatura e avulso.
 */
const get = route(async ({ db, auth }) => json(await meusLimites(db, auth)), { bearer: 'org' })

export const GET = async (req: Request, ctx: { params: Promise<Record<string, string>> }) => comCors(req, await get(req, ctx))
export const OPTIONS = preflight
