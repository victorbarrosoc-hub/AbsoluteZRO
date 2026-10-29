// POST /api/zro/sair — apaga a sessão da Revela e os tokens (o refresh token é revogado na Absolute ZRO). A sessão na
// própria Absolute ZRO continua (sem logout federado, ADR 0012).

import { cookie, COOKIE_CONTA, COOKIE_TOKENS, decifrar, json, lerCookie, origemDoPedido, revogar } from '../_zro.js'

export default async function sair(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return json(res, 405, { ok: false })
  }
  // Só o próprio site pede para sair: outra página não derruba a sessão de ninguém.
  const origin = req.headers.origin
  if (origin && origin !== origemDoPedido(req)) return json(res, 403, { ok: false })
  const t = decifrar(COOKIE_TOKENS, lerCookie(req, COOKIE_TOKENS))
  if (t?.rt) await revogar(t.rt)
  return json(res, 200, { ok: true }, [cookie(COOKIE_CONTA, '', { maxAge: 0, path: '/' }), cookie(COOKIE_TOKENS, '', { maxAge: 0, path: '/api/zro' })])
}
