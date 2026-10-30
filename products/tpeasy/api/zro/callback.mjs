// GET /api/zro/callback — volta do HUB. Confere tudo e grava quem é a pessoa num cookie assinado do app; os tokens do
// HUB vão cifrados noutro cookie (só /api/zro), para o /eu reler o perfil.
import {
  COOKIE_HUB,
  COOKIE_IDA,
  COOKIE_SESSAO,
  DURACAO_SESSAO_S,
  SITE_OFICIAL,
  VOLTA_PADRAO,
  abrir,
  cifrar,
  comAviso,
  config,
  configurado,
  iguais,
  lerCookie,
  origemDoPedido,
  redirecionar,
  selar,
  seguro,
  serializarCookie,
  sessaoDe,
  trocarCodigo,
  urlDoPedido,
  voltaSegura,
} from './_zro.mjs'

export default async function callback(req, res) {
  const origem = origemDoPedido(req)
  if (!origem) return redirecionar(res, 303, `${SITE_OFICIAL}${VOLTA_PADRAO}`)
  const url = urlDoPedido(req)
  const secure = seguro(req)
  const limpar = serializarCookie(COOKIE_IDA, '', { path: '/api/zro', secure, maxAge: 0 })
  const ir = (destino, cookies = []) => redirecionar(res, 303, destino, [limpar, ...cookies])

  if (!configurado()) return ir(comAviso(VOLTA_PADRAO, 'config'))
  const ida = abrir(lerCookie(req, COOKIE_IDA), 'ida')
  if (!ida || typeof ida.state !== 'string' || typeof ida.nonce !== 'string' || typeof ida.verificador !== 'string') {
    return ir(comAviso(VOLTA_PADRAO, 'expirou'))
  }
  const volta = voltaSegura(ida.volta)
  if (!iguais(url.searchParams.get('state'), ida.state)) return ir(comAviso(volta, 'expirou'))
  // RFC 9207: se o HUB disser quem respondeu, tem que ser ele.
  const iss = url.searchParams.get('iss')
  if (iss !== null && iss !== config().emissor) return ir(comAviso(volta, 'erro'))
  const erro = url.searchParams.get('error')
  // HUB de antes do Set: recusa zro.set. Pede de novo sem ele (uma vez); o resto do login não muda.
  if (erro === 'invalid_scope' && !ida.semSet) return ir(`/api/zro/entrar?volta=${encodeURIComponent(volta)}${ida.criar ? '&criar=1' : ''}&sem_set=1`)
  if (erro) return ir(comAviso(volta, erro === 'access_denied' ? 'recusado' : 'erro'))
  const code = url.searchParams.get('code')
  if (!code) return ir(comAviso(volta, 'erro'))

  let r
  try {
    r = await trocarCodigo({ code, verificador: ida.verificador, nonce: ida.nonce, origem })
  } catch {
    return ir(comAviso(volta, 'erro'))
  }
  const sessao = selar(sessaoDe(r.pessoa), 'sessao', DURACAO_SESSAO_S)
  // sem access token: a sessão vale, só não relê o perfil até a próxima entrada
  const hub = r.tokens
    ? serializarCookie(COOKIE_HUB, cifrar({ sub: r.pessoa.sub, ...r.tokens }), { path: '/api/zro', secure, maxAge: DURACAO_SESSAO_S })
    : serializarCookie(COOKIE_HUB, '', { path: '/api/zro', secure, maxAge: 0 })
  ir(volta, [serializarCookie(COOKIE_SESSAO, sessao, { path: '/', secure, maxAge: DURACAO_SESSAO_S }), hub])
}
