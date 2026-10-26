// POST /api/zro/sair — apaga a sessão da Revela. A sessão na Absolute ZRO continua (sem logout federado, ADR 0012).

import { cookie, COOKIE_CONTA, json, origemDoPedido } from '../_zro.js'

export default function sair(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return json(res, 405, { ok: false })
  }
  // Só o próprio site pede para sair: outra página não derruba a sessão de ninguém.
  const origin = req.headers.origin
  if (origin && origin !== origemDoPedido(req)) return json(res, 403, { ok: false })
  return json(res, 200, { ok: true }, [cookie(COOKIE_CONTA, '', { maxAge: 0, path: '/' })])
}
