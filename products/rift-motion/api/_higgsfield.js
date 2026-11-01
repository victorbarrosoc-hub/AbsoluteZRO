// Criar com IA pela Higgsfield das Conexões da Absolute ZRO (migrations 0052 e 0054 do HUB, ADR 0037): o Rift não
// guarda mais conexão nem credencial da Higgsfield. A pessoa conecta a conta uma vez em absolutezro.com/conexoes e o
// Rift pede, com o access token da sessão (escopo zro.higgsfield), em:
//   /api/zro/higgsfield?duracao&proporcao  → <emissor>/api/v1/higgsfield        (painel de créditos e preços, sem gerar)
//   /api/zro/higgsfield/gerar              → <emissor>/api/v1/higgsfield/gerar  (POST envio, telas e animar; GET ?id=)
// Mesmo repasse do AEON (products/ai-edit/api/_higgsfield.js). O token fica no cookie cifrado rf_hub, que só /api/zro
// recebe; a página fala só com este site. Só estes caminhos, métodos e parâmetros; gerar (POST) só do próprio site e
// só JSON pequeno. Sem sessão ou sem tokens: 401. Login de antes do escopo: a Absolute ZRO responde 401 e passa.

import { abrir, cifrar, configurado, cookie, COOKIE_CONTA, COOKIE_HUB, CONTA_S, decifrar, emissor, json, lerCookie, origemDoPedido, tokenValido, ZroRevogado } from './_zro.js'

const ROTAS = { '': ['GET'], '/gerar': ['GET', 'POST'] }
const CORPO_MAX = 20_000
// conferir preço e saldo e pedir à Higgsfield leva alguns segundos; nada fica pendurado
const PRAZO_MS = 60_000

export const caminhoDe = (req) => new URL(req.url || '/', 'https://rift.invalid').pathname.replace(/^\/api\/zro\/higgsfield(?=\/|$)/, '').replace(/\/$/, '')

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
  const hub = conta && typeof conta.sub === 'string' ? decifrar(COOKIE_HUB, lerCookie(req, COOKIE_HUB)) : null
  if (!hub || hub.sub !== conta.sub) return negar(res, 401, 'Entre com a conta Absolute ZRO para criar com a Higgsfield.')
  const cookies = []
  let t
  try {
    const v = await tokenValido(hub)
    t = v.tokens
    if (v.renovou) cookies.push(cookie(COOKIE_HUB, cifrar(COOKIE_HUB, { sub: conta.sub, ...t }), { maxAge: CONTA_S, path: '/api/zro' }))
  } catch (e) {
    if (e instanceof ZroRevogado) return negar(res, 401, 'Entre de novo com a conta Absolute ZRO.', [cookie(COOKIE_HUB, '', { maxAge: 0, path: '/api/zro' })])
    return negar(res, 502, 'A Absolute ZRO não respondeu agora.')
  }
  let corpo
  if (req.method === 'POST') {
    corpo = await lerCorpo(req)
    if (corpo === null) return negar(res, 413, 'Pedido grande demais.', cookies)
  }
  const consulta = req.method === 'GET' ? consultaDe(caminho, new URL(req.url || '/', 'https://rift.invalid').searchParams) : ''
  let r
  try {
    r = await fetch(`${emissor()}/api/v1/higgsfield${caminho}${consulta ? `?${consulta}` : ''}`, {
      method: req.method,
      headers: { authorization: `Bearer ${t.at}`, accept: 'application/json', ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: corpo,
      signal: AbortSignal.timeout(PRAZO_MS),
      redirect: 'manual',
    })
  } catch {
    return negar(res, 502, 'A Absolute ZRO não respondeu agora.', cookies)
  }
  const texto = await r.text().catch(() => '')
  res.statusCode = r.status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  if (cookies.length) res.setHeader('Set-Cookie', cookies)
  res.end(texto)
}
