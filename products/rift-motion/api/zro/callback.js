// GET /api/zro/callback — a Absolute ZRO volta aqui com ?code&state. Confere o state do cookie, troca o código
// (client_secret_basic + PKCE), confere o id_token e cria a sessão do app (rf_conta, 30 dias). Erros voltam ao app
// como ?zro=<codigo>. Os tokens da Absolute ZRO vão cifrados em rf_hub (só /api/zro), para o /eu reler o perfil.

import { timingSafeEqual } from 'node:crypto'
import { abrir, cifrar, comAviso, consulta, cookie, COOKIE_CONTA, COOKIE_HUB, COOKIE_IDA, CONTA_S, emissor, lerCookie, redirecionar, retorno, selar, sessaoDe, trocarCodigo, VOLTA_PADRAO, voltaSegura } from '../_zro.js'

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
  // Absolute ZRO de antes da Higgsfield nas Conexões: recusa zro.higgsfield. Pede de novo sem ele (uma vez); o resto do login não muda.
  if (erro === 'invalid_scope' && !ida.semHf) {
    return redirecionar(res, 303, `/api/zro/entrar?volta=${encodeURIComponent(volta)}${ida.criar ? '&criar=1' : ''}&sem_hf=1`, [limpar])
  }
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
  const p = r.pessoa
  const conta = selar(COOKIE_CONTA, sessaoDe(p), CONTA_S)
  // sem token (a Absolute ZRO não deu access token): a sessão vale, só não relê o perfil até o próximo login
  const hub = r.tokens ? cookie(COOKIE_HUB, cifrar(COOKIE_HUB, { sub: p.sub, ...r.tokens }), { maxAge: CONTA_S, path: '/api/zro' }) : cookie(COOKIE_HUB, '', { maxAge: 0, path: '/api/zro' })
  return redirecionar(res, 303, comAviso(volta, 'ok'), [limpar, cookie(COOKIE_CONTA, conta, { maxAge: CONTA_S, path: '/' }), hub])
}
