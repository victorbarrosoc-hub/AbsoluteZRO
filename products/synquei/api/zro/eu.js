// GET /api/zro/eu — quem está logado no Synquei. 200 com a pessoa; 401 sem sessão (o app mostra "Entrar com Absolute
// ZRO" e "Criar conta"); 503 se o login não está configurado neste site (o app segue como sempre, sem conta).
// `acesso` diz se a organização ativa tem o Synquei em zro_products: sem ele, a parte de conta do app mostra o aviso e
// o link para a Absolute ZRO. O app em si continua aberto, como sem conta.
//
// Perfil único (docs/integration-contracts/perfil-unico.md): a cada abertura do app (no máximo uma vez por minuto) o
// /eu relê nome, e-mail, foto, organização e produtos em /oauth/userinfo com o token do cofre (sq_hub) e regrava a
// sessão. Mudou na conta Absolute ZRO, muda aqui sem a pessoa fazer nada. Absolute ZRO fora do ar: vale a última
// cópia. Absolute ZRO recusou (acesso ao app removido no Perfil, conta inativa): a sessão acaba.

import { abrir, cifrar, configurado, cookie, COOKIE_CONTA, COOKIE_HUB, CONTA_S, decifrar, emissor, FERRAMENTAS, json, lerCookie, lerPerfil, REVER_S, selar, sessaoDe, temAcesso, ZroRevogado } from '../_zro.js'

export default async function eu(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET')
    return json(res, 405, { ok: false })
  }
  if (!configurado()) return json(res, 503, { ok: false, configurado: false })
  const semSessao = (cookies = []) => json(res, 401, { ok: false, configurado: true, entrar: '/api/zro/entrar', criar: '/api/zro/entrar?criar=1' }, cookies)
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
      ferramentas: FERRAMENTAS,
      pessoa: { nome: c.nome || null, email: c.email || null, foto: c.foto || null, conta: c.conta || `${emissor()}/perfil`, organizacao: org, produtos },
    },
    cookies,
  )
}
