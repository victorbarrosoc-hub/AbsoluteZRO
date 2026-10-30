// POST /api/zro/sair — apaga a sessão do Relay e revoga o refresh token na Absolute ZRO. A sessão na Absolute ZRO
// continua (sem logout federado, ADR 0012).

import { cookie, COOKIE_CONTA, COOKIE_HUB, decifrar, json, lerCookie, origemDoPedido, revogar } from '../_zro.js'

export default async function sair(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return json(res, 405, { ok: false })
  }
  // Só o próprio site pede para sair: outra página não derruba a sessão de ninguém.
  const origin = req.headers.origin
  if (origin && origin !== origemDoPedido(req)) return json(res, 403, { ok: false })
  const hub = decifrar(COOKIE_HUB, lerCookie(req, COOKIE_HUB))
  if (hub) await revogar(hub.rt)
  return json(res, 200, { ok: true }, [cookie(COOKIE_CONTA, '', { maxAge: 0, path: '/' }), cookie(COOKIE_HUB, '', { maxAge: 0, path: '/api/zro' })])
}
