// Repasse da Higgsfield pela Absolute ZRO (as Conexões do HUB, migration 0052): /api/zro/higgsfield → <emissor>/api/v1/
// higgsfield (o painel de créditos) e /api/zro/higgsfield/gerar → <emissor>/api/v1/higgsfield/gerar (envio, telas,
// animar e andamento), com o access token da sessão no Authorization. A página fala só com este site (cookie da
// sessão, mesma origem); o token fica no cookie cifrado que só /api/zro recebe. A conta da Higgsfield e os créditos
// ficam no HUB: o AEON nunca vê a credencial da Higgsfield.
// Só estes caminhos, métodos e parâmetros; gerar (POST) só do próprio site e só JSON pequeno.
// Sem sessão ou sem tokens: 401. Token sem zro.higgsfield (login de antes): a Absolute ZRO responde 401 e passa, sem
// apagar o cookie dos tokens. Fechado ao público: 403 antes de tudo.

import { liberado } from './_release.js'
import {
  abrir,
  cifrar,
  configurado,
  cookie,
  COOKIE_CONTA,
  COOKIE_TOKENS,
  CONTA_S,
  decifrar,
  emissor,
  json,
  lerCookie,
  origemDoPedido,
  renovarTokens,
  ZroErro,
} from './_zro.js'

const ROTAS = { '': ['GET'], '/gerar': ['GET', 'POST'] }
const CORPO_MAX = 20_000
// conferir preço e saldo e pedir à Higgsfield leva alguns segundos; nada fica pendurado
const PRAZO_MS = 60_000
const agoraS = () => Math.floor(Date.now() / 1000)

export const caminhoDe = (req) => new URL(req.url || '/', 'https://site.invalid').pathname.replace(/^\/api\/zro\/higgsfield(?=\/|$)/, '').replace(/\/$/, '')

/** A consulta que segue para a Absolute ZRO, só com os parâmetros conferidos. */
export function consultaDe(caminho, q) {
  const so = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v)).toString()
  if (caminho === '')
    return so({
      duracao: ['curto', 'longo'].includes(q.get('duracao')) ? q.get('duracao') : '',
      proporcao: ['16:9', '9:16', '1:1', '4:5'].includes(q.get('proporcao')) ? q.get('proporcao') : '',
    })
  return so({ id: /^[a-z0-9]{12}$/.test(q.get('id') || '') ? q.get('id') : 'x' })
}

async function lerCorpo(req) {
  // a Vercel pode já ter lido o corpo (req.body); no servidor http puro, lê o fluxo
  if (req.body !== undefined && req.body !== null) {
    const s = typeof req.body === 'string' || Buffer.isBuffer(req.body) ? String(req.body) : JSON.stringify(req.body)
    return s.length > CORPO_MAX ? null : s
  }
  let n = 0
  const partes = []
  for await (const p of req) {
    n += p.length
    if (n > CORPO_MAX) return null
    partes.push(p)
  }
  return Buffer.concat(partes).toString('utf8')
}

const negar = (res, status, message, cookies = []) => json(res, status, { ok: false, message }, cookies)

export async function repassarHiggsfield(req, res, caminho = caminhoDe(req)) {
  const metodos = ROTAS[caminho]
  if (!metodos) return negar(res, 404, 'Não encontrado.')
  if (!metodos.includes(req.method)) {
    res.setHeader('Allow', metodos.join(', '))
    return negar(res, 405, 'Método não permitido.')
  }
  // gerar gasta créditos: só do próprio site, e só JSON
  if (req.method === 'POST') {
    const origin = req.headers.origin
    if (origin && origin !== origemDoPedido(req)) return negar(res, 403, 'Pedido de outra origem recusado.')
    if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return negar(res, 415, 'Mande JSON.')
  }
  if (!configurado()) return negar(res, 503, 'O login com a Absolute ZRO não está ligado aqui.')
  const conta = abrir(COOKIE_CONTA, lerCookie(req, COOKIE_CONTA))
  if (conta && typeof conta.sub === 'string' && !liberado(conta)) return negar(res, 403, 'Indisponível.')
  let t = conta && typeof conta.sub === 'string' ? decifrar(COOKIE_TOKENS, lerCookie(req, COOKIE_TOKENS)) : null
  if (!t) return negar(res, 401, 'Entre com a conta Absolute ZRO para criar com a Higgsfield.')
  const cookies = []
  if (!t.at || !(t.atExp > agoraS() + 30)) {
    try {
      t = await renovarTokens(t)
      cookies.push(cookie(COOKIE_TOKENS, cifrar(COOKIE_TOKENS, t, CONTA_S), { maxAge: CONTA_S, path: '/api/zro' }))
    } catch (e) {
      if (e instanceof ZroErro && e.message === 'recusado')
        return negar(res, 401, 'Entre de novo com a conta Absolute ZRO.', [cookie(COOKIE_TOKENS, '', { maxAge: 0, path: '/api/zro' })])
      return negar(res, 502, 'A Absolute ZRO não respondeu agora.')
    }
  }
  let corpo
  if (req.method === 'POST') {
    corpo = await lerCorpo(req)
    if (corpo === null) return negar(res, 413, 'Pedido grande demais.', cookies)
  }
  const consulta = req.method === 'GET' ? consultaDe(caminho, new URL(req.url || '/', 'https://site.invalid').searchParams) : ''
  const ctrl = new AbortController()
  const prazo = setTimeout(() => ctrl.abort(), PRAZO_MS)
  let r
  try {
    r = await fetch(`${emissor()}/api/v1/higgsfield${caminho}${consulta ? `?${consulta}` : ''}`, {
      method: req.method,
      headers: { authorization: `Bearer ${t.at}`, accept: 'application/json', ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: corpo,
      signal: ctrl.signal,
      redirect: 'manual',
    })
  } catch {
    clearTimeout(prazo)
    return negar(res, 502, 'A Absolute ZRO não respondeu agora.', cookies)
  }
  const texto = await r.text().catch(() => '')
  clearTimeout(prazo)
  res.statusCode = r.status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  if (cookies.length) res.setHeader('Set-Cookie', cookies)
  res.end(texto)
}
