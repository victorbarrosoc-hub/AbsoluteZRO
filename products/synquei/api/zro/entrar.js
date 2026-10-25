// GET /api/zro/entrar?volta=/app/%23/ajustes — começa o "Entrar com Absolute ZRO". O botão Abrir do HUB também chega
// por aqui: quem já está logado na Absolute ZRO volta ao app logado, sem tela de permissão (app da família).

import { clientId, comAviso, configurado, consulta, cookie, COOKIE_IDA, desafioPkce, descobrir, ESCOPOS, IDA_S, novoValor, origemDoPedido, origemPermitida, redirecionar, retorno, selar, voltaSegura } from '../_zro.js'

export default async function entrar(req, res) {
  const volta = voltaSegura(consulta(req).get('volta'))
  // A Absolute ZRO volta para o endereço cadastrado: o cookie da ida precisa nascer nele.
  const origem = origemPermitida(req)
  if (origemDoPedido(req) !== origem) return redirecionar(res, 307, `${origem}/api/zro/entrar?volta=${encodeURIComponent(volta)}`)
  if (!configurado()) return redirecionar(res, 303, comAviso(volta, 'config'))

  const state = novoValor()
  const nonce = novoValor()
  const verificador = novoValor()
  let destino
  try {
    const u = new URL((await descobrir()).authorization_endpoint)
    u.searchParams.set('response_type', 'code')
    u.searchParams.set('client_id', clientId())
    u.searchParams.set('redirect_uri', retorno(origem))
    u.searchParams.set('scope', ESCOPOS)
    u.searchParams.set('state', state)
    u.searchParams.set('nonce', nonce)
    u.searchParams.set('code_challenge', desafioPkce(verificador))
    u.searchParams.set('code_challenge_method', 'S256')
    destino = u.toString()
  } catch {
    return redirecionar(res, 303, comAviso(volta, 'erro'))
  }
  const ida = selar(COOKIE_IDA, { state, nonce, verificador, volta, origem }, IDA_S)
  return redirecionar(res, 302, destino, [cookie(COOKIE_IDA, ida, { maxAge: IDA_S, path: '/api/zro' })])
}
