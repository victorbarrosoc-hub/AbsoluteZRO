// GET /api/zro/eu — quem está logado no Rift. O Rift é aberto (converter não pede conta), então a resposta é sempre
// 200, sem erro no console de quem só veio converter: { ok: true, pessoa } com sessão; { ok: false, configurado: true }
// sem sessão (o topo oferece "Set", que leva a entrar); { ok: false, configurado: false } sem o login ligado neste site.
//
// Perfil único (porta do Synquei): no máximo uma vez por minuto relê nome, e-mail, foto, organização e produtos em
// /oauth/userinfo com o token do cofre (rf_hub) e regrava a sessão. Absolute ZRO fora do ar: vale a última cópia.
// Absolute ZRO recusou (acesso ao app removido no Perfil, conta inativa): a sessão acaba.

import { zLiberado } from '../_z.js'
import { abrir, cifrar, configurado, cookie, COOKIE_CONTA, COOKIE_HUB, CONTA_S, decifrar, emissor, FERRAMENTAS, idLocal, json, lerCookie, lerPerfil, REVER_S, selar, sessaoDe, temAcesso, ZroRevogado } from '../_zro.js'

export default async function eu(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET')
    return json(res, 405, { ok: false })
  }
  if (!configurado()) return json(res, 200, { ok: false, configurado: false })
  const semSessao = (cookies = []) => json(res, 200, { ok: false, configurado: true, entrar: '/api/zro/entrar', criar: '/api/zro/entrar?criar=1' }, cookies)
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
      acesso: temAcesso(produtos),
      // a Z no Rift: só para quem está liberado (fase 2 para todos)
      z: zLiberado(c.sub),
      // os apps que a pessoa vê no ecossistema (null: ainda sem a informação, o painel mostra só os lançados)
      apps: Array.isArray(c.apps) ? c.apps : null,
      ferramentas: FERRAMENTAS,
      // id: resumo do sub, só para separar o histórico de cada conta no aparelho (app/historico.js)
      pessoa: { id: idLocal(c.sub), nome: c.nome || null, email: c.email || null, foto: c.foto || null, conta: c.conta || `${emissor()}/perfil`, organizacao: org, produtos },
    },
    cookies,
  )
}
