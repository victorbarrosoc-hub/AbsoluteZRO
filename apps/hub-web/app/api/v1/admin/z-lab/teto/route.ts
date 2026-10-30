import { definirTeto } from '@zro/core'
import { json, readJson, route } from '@/lib/api'

/** Teto de gasto por dia do laboratório, em US$ (`null` = sem teto = tudo bloqueado). Auditado. */
export const PUT = route(async ({ db, auth, req }) => json({ teto: await definirTeto(db, auth, await readJson(req, 2_000)) }), { mutation: true })
