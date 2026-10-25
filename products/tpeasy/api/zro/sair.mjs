// POST /api/zro/sair — apaga a sessão do app. Os roteiros ficam no aparelho; a conta no HUB continua aberta.
import { COOKIE_SESSAO, json, origemDoPedido, seguro, serializarCookie } from './_zro.mjs'

export default function sair(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return json(res, 405, { erro: 'metodo' })
  }
  // Só o próprio app pode pedir para sair.
  const vindoDe = req.headers.origin
  if (vindoDe && vindoDe !== origemDoPedido(req)) return json(res, 403, { erro: 'origem' })
  const site = req.headers['sec-fetch-site']
  if (site && site !== 'same-origin' && site !== 'none') return json(res, 403, { erro: 'origem' })
  json(res, 200, { ok: true }, [serializarCookie(COOKIE_SESSAO, '', { path: '/', secure: seguro(req), maxAge: 0 })])
}
