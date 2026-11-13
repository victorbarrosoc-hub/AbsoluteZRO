// GET /api/zro/eu — quem está logado: { ok: true, acesso, pessoa } com sessão; { ok: false, configurado } sem.
// `acesso` é o gate de lançamento (claim zro_release): sem ele o app não abre. No modo local (api/_sessao.js, só
// para desenvolver), a pessoa é a do cookie foto_local e a resposta leva `local: true`.
//
// Perfil único (mesmo desenho do RADION): no máximo uma vez por minuto relê nome, e-mail, foto, organização e produtos em
// /oauth/userinfo com o token do cofre (foto_hub) e regrava a sessão. Absolute ZRO fora do ar: vale a última cópia.
// Absolute ZRO recusou (acesso ao app removido no Perfil, conta inativa): a sessão acaba.

import { modoLocal, pessoaDe } from '../_sessao.js'
import { abrir, cifrar, configurado, cookie, COOKIE_CONTA, COOKIE_HUB, CONTA_S, decifrar, emissor, idLocal, json, lerCookie, lerPerfil, REVER_S, selar, sessaoDe, temAcesso, ZroRevogado } from '../_zro.js'

export default async function eu(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET')
    return json(res, 405, { ok: false })
  }
  if (modoLocal(req)) {
    const p = pessoaDe(req)
    if (p) return json(res, 200, { ok: true, acesso: true, local: true, pessoa: { id: idLocal(p.sub), nome: p.nome, email: null, foto: null, conta: null, organizacao: null, produtos: [] } })
  }
  if (!configurado()) return json(res, 200, { ok: false, configurado: false })
  const semSessao = (cookies = []) => json(res, 200, { ok: false, configurado: true, entrar: '/api/zro/entrar' }, cookies)
  let c = abrir(COOKIE_CONTA, lerCookie(req, COOKIE_CONTA))
  if (!c || typeof c.sub !== 'string') return semSessao()

  const cookies = []
  const hub = decifrar(COOKIE_HUB, lerCookie(req, COOKIE_HUB))
  const agora = Math.floor(Date.now() / 1000)
  if (hub && hub.sub === c.sub && !(typeof c.lido === 'number' && agora - c.lido < REVER_S)) {
    try {
      const { pessoa, tokens } = await lerPerfil(c.sub, hub)
      c = sessaoDe(pessoa)
      cookies.push(cookie(COOKIE_CONTA, selar(COOKIE_CONTA, c, CONTA_S), { maxAge: CONTA_S, path: '/' }))
      cookies.push(cookie(COOKIE_HUB, cifrar(COOKIE_HUB, { sub: c.sub, ...tokens }), { maxAge: CONTA_S, path: '/api/zro' }))
    } catch (e) {
      if (e instanceof ZroRevogado) return semSessao([cookie(COOKIE_CONTA, '', { maxAge: 0, path: '/' }), cookie(COOKIE_HUB, '', { maxAge: 0, path: '/api/zro' })])
      // rede ou Absolute ZRO fora: segue com a última cópia
    }
  }
  const org = c.org && typeof c.org === 'object' ? { nome: c.org.nome || null, papel: c.org.papel || null } : null
  const produtos = Array.isArray(c.produtos) ? c.produtos : []
  return json(
    res,
    200,
    {
      ok: true,
      acesso: temAcesso(c.apps),
      pessoa: { id: idLocal(c.sub), nome: c.nome || null, email: c.email || null, foto: c.foto || null, conta: c.conta || `${emissor()}/perfil`, organizacao: org, produtos },
    },
    cookies,
  )
}
