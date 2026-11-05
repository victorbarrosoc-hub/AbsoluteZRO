// POST /api/local { nome } — só no modo local (api/_sessao.js): escolhe a pessoa deste navegador para testar o rádio
// sem o login único. Fora do modo local, 404.

import { randomBytes } from 'node:crypto'
import { json } from './_zro.js'
import { lerJson, modoLocal, nomeLimpo } from './_sessao.js'

export default async function local(req, res) {
  if (!modoLocal(req) || req.method !== 'POST') return json(res, 404, { ok: false })
  const nome = nomeLimpo((await lerJson(req).catch(() => ({}))).nome)
  if (!nome) return json(res, 400, { ok: false })
  const v = Buffer.from(JSON.stringify({ sub: `local-${randomBytes(8).toString('hex')}`, nome })).toString('base64url')
  return json(res, 200, { ok: true }, [`rd_local=${v}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax`])
}
