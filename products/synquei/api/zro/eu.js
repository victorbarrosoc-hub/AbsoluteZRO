// GET /api/zro/eu — quem está logado no Synquei. 200 com a pessoa; 401 sem sessão (o app mostra "Entrar com Absolute
// ZRO" e "Criar conta"); 503 se o login não está configurado neste site (o app segue como sempre, sem conta).
// `acesso` diz se a organização ativa tem o Synquei em zro_products (vem do último login): sem ele, a parte de conta
// do app mostra o aviso e o link para a Absolute ZRO. O app em si continua aberto, como sem conta.

import { abrir, configurado, COOKIE_CONTA, FERRAMENTAS, json, lerCookie, temAcesso } from '../_zro.js'

export default function eu(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET')
    return json(res, 405, { ok: false })
  }
  if (!configurado()) return json(res, 503, { ok: false, configurado: false })
  const c = abrir(COOKIE_CONTA, lerCookie(req, COOKIE_CONTA))
  if (!c || typeof c.sub !== 'string') return json(res, 401, { ok: false, configurado: true, entrar: '/api/zro/entrar', criar: '/api/zro/entrar?criar=1' })
  const org = c.org && typeof c.org === 'object' ? { nome: c.org.nome || null, papel: c.org.papel || null } : null
  const produtos = Array.isArray(c.produtos) ? c.produtos : []
  return json(res, 200, {
    ok: true,
    acesso: temAcesso(produtos),
    ferramentas: FERRAMENTAS,
    pessoa: { nome: c.nome || null, email: c.email || null, organizacao: org, produtos },
  })
}
