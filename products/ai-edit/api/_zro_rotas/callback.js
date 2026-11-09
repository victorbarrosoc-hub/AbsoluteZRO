// GET /api/zro/callback — a Absolute ZRO volta aqui com ?code&state. Confere o state do cookie, troca o código
// (client_secret_basic + PKCE), confere o id_token e cria a sessão do app (ae_conta, 30 dias). Erros voltam ao app
// como ?zro=<codigo>. A sessão tem só quem é a pessoa (com a foto da conta); os tokens, para reler o perfil depois,
// vão cifrados num cookie que só /api/zro recebe e que o JavaScript da página não lê.
// Fechado ao público (../_release.js): conta que o HUB não liberou não ganha sessão e vai para "Em desenvolvimento".

import { timingSafeEqual } from 'node:crypto'
import { liberado, PAGINA_FECHADO } from '../_release.js'
import { abrir, cifrar, comAviso, consulta, cookie, COOKIE_CONTA, COOKIE_IDA, COOKIE_TOKENS, CONTA_S, emissor, lerCookie, redirecionar, retorno, selar, sessaoDe, trocarCodigo, VOLTA_PADRAO, voltaSegura } from '../_zro.js'

const igual = (a, b) => {
  const x = Buffer.from(String(a || ''))
  const y = Buffer.from(String(b || ''))
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y)
}

export default async function callback(req, res) {
  const q = consulta(req)
  const limpar = cookie(COOKIE_IDA, '', { maxAge: 0, path: '/api/zro' })
  const ida = abrir(COOKIE_IDA, lerCookie(req, COOKIE_IDA))
  if (!ida || typeof ida.state !== 'string' || typeof ida.nonce !== 'string' || typeof ida.verificador !== 'string' || typeof ida.origem !== 'string') {
    return redirecionar(res, 303, comAviso(VOLTA_PADRAO, 'expirou'), [limpar])
  }
  const volta = voltaSegura(ida.volta)
  const falhar = (codigo) => redirecionar(res, 303, comAviso(volta, codigo), [limpar])

  if (!igual(q.get('state'), ida.state)) return falhar('expirou')
  const erro = q.get('error')
  // cliente ainda sem o escopo zro.ia na Absolute ZRO: o login não pode quebrar por causa da Z, entra sem ela
  // primeiro sem a Higgsfield, depois sem os sons, sem o Set (Absolute ZRO de antes deles); por fim, sem a Z também
  if (erro === 'invalid_scope' && ida.hf === true) return redirecionar(res, 303, `/api/zro/entrar?volta=${encodeURIComponent(volta)}${ida.criar ? '&criar=1' : ''}&sem_hf=1`, [limpar])
  if (erro === 'invalid_scope' && ida.sons === true) return redirecionar(res, 303, `/api/zro/entrar?volta=${encodeURIComponent(volta)}${ida.criar ? '&criar=1' : ''}&sem_sons=1`, [limpar])
  if (erro === 'invalid_scope' && ida.set === true) return redirecionar(res, 303, `/api/zro/entrar?volta=${encodeURIComponent(volta)}${ida.criar ? '&criar=1' : ''}&sem_set=1`, [limpar])
  if (erro === 'invalid_scope' && ida.ia === true) return redirecionar(res, 303, `/api/zro/entrar?volta=${encodeURIComponent(volta)}${ida.criar ? '&criar=1' : ''}&sem_ia=1`, [limpar])
  if (erro) return falhar(erro === 'access_denied' ? 'recusado' : 'erro')
  // RFC 9207: quando a resposta diz quem a emitiu, tem que ser a Absolute ZRO configurada.
  if (q.has('iss') && q.get('iss') !== emissor()) return falhar('erro')
  const code = q.get('code')
  if (!code) return falhar('erro')

  let r
  try {
    r = await trocarCodigo(code, ida.verificador, ida.nonce, retorno(ida.origem))
  } catch {
    return falhar('erro')
  }
  const sessao = sessaoDe(r.pessoa)
  // o HUB já não emite código para quem não está na lista; aqui vale também com um HUB sem o gate: sem a liberação,
  // a sessão não nasce (e uma sessão antiga que houvesse é apagada)
  if (!liberado(sessao)) return redirecionar(res, 303, PAGINA_FECHADO, [limpar, cookie(COOKIE_CONTA, '', { maxAge: 0, path: '/' }), cookie(COOKIE_TOKENS, '', { maxAge: 0, path: '/api/zro' })])
  const conta = selar(COOKIE_CONTA, sessao, CONTA_S)
  const tokens = r.tokens ? cookie(COOKIE_TOKENS, cifrar(COOKIE_TOKENS, r.tokens, CONTA_S), { maxAge: CONTA_S, path: '/api/zro' }) : cookie(COOKIE_TOKENS, '', { maxAge: 0, path: '/api/zro' })
  return redirecionar(res, 303, comAviso(volta, 'ok'), [limpar, cookie(COOKIE_CONTA, conta, { maxAge: CONTA_S, path: '/' }), tokens])
}
