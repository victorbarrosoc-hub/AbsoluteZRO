// GET /api/zro/callback — volta do HUB. Confere tudo e grava só quem é a pessoa num cookie assinado do app.
import {
  COOKIE_IDA,
  COOKIE_SESSAO,
  DURACAO_SESSAO_S,
  SITE_OFICIAL,
  VOLTA_PADRAO,
  abrir,
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
  if (erro) return ir(comAviso(volta, erro === 'access_denied' ? 'recusado' : 'erro'))
  const code = url.searchParams.get('code')
  if (!code) return ir(comAviso(volta, 'erro'))

  let pessoa
  try {
    pessoa = await trocarCodigo({ code, verificador: ida.verificador, nonce: ida.nonce, origem })
  } catch {
    return ir(comAviso(volta, 'erro'))
  }
  const sessao = selar(pessoa, 'sessao', DURACAO_SESSAO_S)
  ir(volta, [serializarCookie(COOKIE_SESSAO, sessao, { path: '/', secure, maxAge: DURACAO_SESSAO_S })])
}
