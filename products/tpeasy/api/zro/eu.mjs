// GET /api/zro/eu — quem está no app: 200 com o perfil, 401 sem sessão, 503 sem configuração. Nunca vai para cache.
import { COOKIE_SESSAO, abrir, configurado, json, lerCookie } from './_zro.mjs'

export default function eu(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET')
    return json(res, 405, { erro: 'metodo' })
  }
  if (!configurado()) return json(res, 503, { configurado: false })
  const s = abrir(lerCookie(req, COOKIE_SESSAO), 'sessao')
  if (!s || typeof s.sub !== 'string' || typeof s.email !== 'string') return json(res, 401, { entrou: false })
  json(res, 200, {
    entrou: true,
    sub: s.sub,
    nome: s.nome ?? null,
    email: s.email,
    organizacao: s.organizacao ?? null,
    produtos: Array.isArray(s.produtos) ? s.produtos : [],
  })
}
