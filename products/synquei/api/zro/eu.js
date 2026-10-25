// GET /api/zro/eu — quem está logado no Synquei. 200 com a pessoa; 401 sem sessão (o app mostra "Entrar com Absolute
// ZRO"); 503 se o login não está configurado neste site (o app segue como sempre, sem conta).

import { abrir, configurado, COOKIE_CONTA, json, lerCookie } from '../_zro.js'

export default function eu(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET')
    return json(res, 405, { ok: false })
  }
  if (!configurado()) return json(res, 503, { ok: false, configurado: false })
  const c = abrir(COOKIE_CONTA, lerCookie(req, COOKIE_CONTA))
  if (!c || typeof c.sub !== 'string') return json(res, 401, { ok: false, configurado: true, entrar: '/api/zro/entrar' })
  const org = c.org && typeof c.org === 'object' ? { nome: c.org.nome || null, papel: c.org.papel || null } : null
  return json(res, 200, {
    ok: true,
    pessoa: { nome: c.nome || null, email: c.email || null, organizacao: org, produtos: Array.isArray(c.produtos) ? c.produtos : [] },
  })
}
