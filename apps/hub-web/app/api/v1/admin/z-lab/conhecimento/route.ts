import { adicionarConhecimento } from '@zro/core'
import { json, readJson, route } from '@/lib/api'

/** Um texto de referência novo (FAQ, planos, preços, manual) que a Z pode consultar quando estiver ativo no rascunho. */
export const POST = route(async ({ db, auth, req }) => json({ texto: await adicionarConhecimento(db, auth, await readJson(req, 450_000)) }, 201), {
  mutation: true,
})
