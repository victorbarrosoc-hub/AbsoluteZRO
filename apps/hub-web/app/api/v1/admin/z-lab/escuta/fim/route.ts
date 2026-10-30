import { fecharEscuta } from '@zro/core'
import { json, readJson, route } from '@/lib/api'

/** Fecha a escuta ao vivo com os segundos que o navegador contou (nunca mais que o tempo real desde a abertura). */
export const POST = route(async ({ db, auth, req }) => json(await fecharEscuta(db, auth, await readJson(req, 2_000))), { mutation: true })
