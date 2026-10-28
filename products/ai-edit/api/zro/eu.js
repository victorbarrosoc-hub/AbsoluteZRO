// GET /api/zro/eu — quem está logado no AEON. 200 com a pessoa; 401 sem sessão (o app mostra "Entrar com Absolute
// ZRO" e "Criar conta"); 403 com sessão que o HUB não liberou enquanto o AEON está fechado ao público (api/_release.js:
// o app mostra "Em desenvolvimento" com a volta ao HUB); 503 se o login não está configurado neste site.
// `acesso` diz se a organização ativa tem o AEON em zro_products: sem ele, a parte de conta do app mostra o aviso e o
// link para a Absolute ZRO.
//
// Perfil único: a cada abertura relê o perfil na Absolute ZRO (/oauth/userinfo, renovando o token se precisar) e
// regrava a cópia da sessão. Nome, e-mail e foto se editam só na conta (`conta`, que abre fora do app). A releitura
// traz também a claim zro_release: liberação tirada no HUB vira 403 na abertura seguinte.

import { HUB_INICIO, liberado, PAGINA_FECHADO } from '../_release.js'
import { abrir, cifrar, configurado, cookie, COOKIE_CONTA, COOKIE_TOKENS, CONTA_S, decifrar, emissor, enderecoDaZro, FERRAMENTAS, json, lerCookie, relerPerfil, selar, sessaoDe, temAcesso, ZroErro } from '../_zro.js'

export default async function eu(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET')
    return json(res, 405, { ok: false })
  }
  if (!configurado()) return json(res, 503, { ok: false, configurado: false })
  let c = abrir(COOKIE_CONTA, lerCookie(req, COOKIE_CONTA))
  if (!c || typeof c.sub !== 'string') return json(res, 401, { ok: false, configurado: true, entrar: '/api/zro/entrar', criar: '/api/zro/entrar?criar=1' })

  const cookies = []
  const t = decifrar(COOKIE_TOKENS, lerCookie(req, COOKIE_TOKENS))
  if (t) {
    // a cópia nova vale até o mesmo dia da sessão: reler o perfil não estica a sessão
    const restante = Math.max(0, c.exp - Math.floor(Date.now() / 1000))
    try {
      const r = await relerPerfil(c.sub, t)
      cookies.push(cookie(COOKIE_CONTA, selar(COOKIE_CONTA, sessaoDe(r.pessoa), CONTA_S, c.exp), { maxAge: restante, path: '/' }))
      if (r.tokens !== t) cookies.push(cookie(COOKIE_TOKENS, cifrar(COOKIE_TOKENS, r.tokens, CONTA_S), { maxAge: CONTA_S, path: '/api/zro' }))
      c = sessaoDe(r.pessoa)
    } catch (e) {
      // acesso removido, conta fora da lista do produto fechado ou token já usado: esquece os tokens e a cópia deixa de
      // valer como liberada (403 enquanto fechado) até a pessoa entrar de novo; o resto da cópia fica.
      // Rede fora ou demora: só fica com a cópia (tenta de novo na próxima abertura).
      if (e instanceof ZroErro && e.message === 'recusado') {
        cookies.push(cookie(COOKIE_TOKENS, '', { maxAge: 0, path: '/api/zro' }))
        c = { ...c, release: null }
        cookies.push(cookie(COOKIE_CONTA, selar(COOKIE_CONTA, c, CONTA_S, c.exp), { maxAge: restante, path: '/' }))
      }
    }
  }
  // fechado ao público: só a conta que o HUB liberou passa daqui (a página mostra "Em desenvolvimento")
  if (!liberado(c)) return json(res, 403, { ok: false, fechado: true, hub: HUB_INICIO, pagina: PAGINA_FECHADO }, cookies)

  const org = c.org && typeof c.org === 'object' ? { nome: c.org.nome || null, papel: c.org.papel || null } : null
  const produtos = Array.isArray(c.produtos) ? c.produtos : []
  return json(
    res,
    200,
    {
      ok: true,
      acesso: temAcesso(produtos),
      ferramentas: FERRAMENTAS,
      conta: enderecoDaZro(c.conta, '/') || `${emissor()}/perfil`,
      pessoa: { nome: c.nome || null, email: c.email || null, foto: enderecoDaZro(c.foto, '/api/v1/foto/'), organizacao: org, produtos },
    },
    cookies,
  )
}
