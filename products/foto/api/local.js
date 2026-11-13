// POST /api/local { nome } — só no modo local (api/_sessao.js): troca a pessoa deste navegador para testar o app sem
// o login único (duas pessoas = dois navegadores). Fora do modo local, 404.

import { randomBytes } from 'node:crypto'
import { COOKIE_LOCAL, lerJson, modoLocal, nomeLimpo, selarLocal } from './_sessao.js'
import { json } from './_zro.js'

/** O Set-Cookie de uma pessoa local nova. */
export const cookieLocal = (nome) => `${COOKIE_LOCAL}=${selarLocal(`local-${randomBytes(8).toString('hex')}`, nome)}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax`

export default async function local(req, res) {
  if (!modoLocal(req) || req.method !== 'POST') return json(res, 404, { ok: false })
  const nome = nomeLimpo((await lerJson(req).catch(() => ({}))).nome)
  if (!nome) return json(res, 400, { ok: false })
  return json(res, 200, { ok: true }, [cookieLocal(nome)])
}
