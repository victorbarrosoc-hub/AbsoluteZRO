// GET /api/zro/entrar?volta=/app/ — começa o "Entrar com Absolute ZRO". O HUB também abre o app por aqui.
// Com ?criar=1 é o "Criar conta": o HUB abre o cadastro (prompt=create). O TPeasy não cria contas próprias.
// Com ?sem_roteiros=1, o mesmo pedido sem tpeasy.roteiros (a Absolute ZRO de antes da 0040 recusou); com ?sem_set=1,
// sem o Set também (a de antes do Set recusou zro.set; ver callback).
import {
  COOKIE_IDA,
  DURACAO_IDA_S,
  SITE_OFICIAL,
  comAviso,
  configurado,
  desafioDe,
  novoValor,
  origemDoPedido,
  redirecionar,
  selar,
  seguro,
  serializarCookie,
  urlDeLogin,
  urlDoPedido,
  voltaSegura,
} from './_zro.mjs'

export default async function entrar(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET')
    return redirecionar(res, 303, '/app/')
  }
  const url = urlDoPedido(req)
  const volta = voltaSegura(url.searchParams.get('volta'))
  const criar = url.searchParams.get('criar') === '1'
  const semSet = url.searchParams.get('sem_set') === '1'
  const semRoteiros = semSet || url.searchParams.get('sem_roteiros') === '1'

  // O HUB só volta para o endereço cadastrado: o cookie da ida precisa nascer nele.
  const origem = origemDoPedido(req)
  if (!origem) return redirecionar(res, 307, `${SITE_OFICIAL}/api/zro/entrar${url.search}`)
  if (!configurado()) return redirecionar(res, 302, comAviso(volta, 'config'))

  const state = novoValor()
  const nonce = novoValor()
  const verificador = novoValor()
  let destino
  try {
    destino = await urlDeLogin({ state, nonce, desafio: desafioDe(verificador), origem, criar, semSet, semRoteiros })
  } catch {
    return redirecionar(res, 302, comAviso(volta, 'erro'))
  }
  const ida = selar({ state, nonce, verificador, volta, ...(criar ? { criar: true } : {}), ...(semSet ? { semSet: true } : {}), ...(semRoteiros ? { semRoteiros: true } : {}) }, 'ida', DURACAO_IDA_S)
  redirecionar(res, 302, destino, [serializarCookie(COOKIE_IDA, ida, { maxAge: DURACAO_IDA_S, path: '/api/zro', secure: seguro(req) })])
}
