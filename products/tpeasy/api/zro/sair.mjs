// POST /api/zro/sair — apaga a sessão do app e revoga o refresh token no HUB. Os roteiros ficam no aparelho; a conta no
// HUB continua aberta.
import { COOKIE_HUB, COOKIE_SESSAO, decifrar, json, lerCookie, origemDoPedido, revogar, seguro, serializarCookie } from './_zro.mjs'

export default async function sair(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return json(res, 405, { erro: 'metodo' })
  }
  // Só o próprio app pode pedir para sair.
  const vindoDe = req.headers.origin
  if (vindoDe && vindoDe !== origemDoPedido(req)) return json(res, 403, { erro: 'origem' })
  const site = req.headers['sec-fetch-site']
  if (site && site !== 'same-origin' && site !== 'none') return json(res, 403, { erro: 'origem' })
  let hub = null
  try {
    hub = decifrar(lerCookie(req, COOKIE_HUB))
  } catch {
    hub = null
  }
  if (hub) await revogar(hub.rt)
  const secure = seguro(req)
  json(res, 200, { ok: true }, [
    serializarCookie(COOKIE_SESSAO, '', { path: '/', secure, maxAge: 0 }),
    serializarCookie(COOKIE_HUB, '', { path: '/api/zro', secure, maxAge: 0 }),
  ])
}
