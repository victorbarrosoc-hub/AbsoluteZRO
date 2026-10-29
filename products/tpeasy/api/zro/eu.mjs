// GET /api/zro/eu — quem está no app: 200 com o perfil, 401 sem sessão, 503 sem configuração. Nunca vai para cache.
// `acesso` diz se a organização ativa liberou o TPeasy (zro_products).
//
// Perfil único (docs/integration-contracts/perfil-unico.md): a cada abertura do app (no máximo uma vez por minuto) relê
// nome, e-mail, foto, organização e produtos em /oauth/userinfo com o token do cofre (tp_zro_hub) e regrava a sessão.
// Mudou na conta Absolute ZRO, muda aqui sem a pessoa fazer nada. HUB fora do ar: vale a última cópia. HUB recusou
// (acesso ao app removido no Perfil, conta inativa): a sessão acaba.
import {
  COOKIE_HUB,
  COOKIE_SESSAO,
  DURACAO_SESSAO_S,
  REVER_S,
  ZroError,
  abrir,
  cifrar,
  config,
  configurado,
  decifrar,
  json,
  lerCookie,
  lerPerfil,
  selar,
  seguro,
  serializarCookie,
  sessaoDe,
  temAcesso,
} from './_zro.mjs'

export default async function eu(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET')
    return json(res, 405, { erro: 'metodo' })
  }
  if (!configurado()) return json(res, 503, { configurado: false })
  let s = abrir(lerCookie(req, COOKIE_SESSAO), 'sessao')
  if (!s || typeof s.sub !== 'string' || typeof s.email !== 'string') return json(res, 401, { entrou: false })

  const secure = seguro(req)
  const cookies = []
  const hub = decifrar(lerCookie(req, COOKIE_HUB))
  const agora = Math.floor(Date.now() / 1000)
  if (hub && hub.sub === s.sub && !(typeof s.lido === 'number' && agora - s.lido < REVER_S)) {
    try {
      const { pessoa, tokens } = await lerPerfil(s.sub, hub)
      s = sessaoDe(pessoa)
      cookies.push(serializarCookie(COOKIE_SESSAO, selar(s, 'sessao', DURACAO_SESSAO_S), { path: '/', secure, maxAge: DURACAO_SESSAO_S }))
      cookies.push(serializarCookie(COOKIE_HUB, cifrar({ sub: s.sub, ...tokens }), { path: '/api/zro', secure, maxAge: DURACAO_SESSAO_S }))
    } catch (e) {
      if (e instanceof ZroError && e.codigo === 'revogado') {
        return json(res, 401, { entrou: false }, [
          serializarCookie(COOKIE_SESSAO, '', { path: '/', secure, maxAge: 0 }),
          serializarCookie(COOKIE_HUB, '', { path: '/api/zro', secure, maxAge: 0 }),
        ])
      }
      // rede ou HUB fora: segue com a última cópia
    }
  }
  json(
    res,
    200,
    {
      entrou: true,
      sub: s.sub,
      nome: s.nome ?? null,
      email: s.email,
      foto: s.foto ?? null,
      conta: s.conta ?? `${config().emissor}/perfil`,
      organizacao: s.organizacao ?? null,
      produtos: Array.isArray(s.produtos) ? s.produtos : [],
      acesso: temAcesso(s.produtos),
    },
    cookies,
  )
}
