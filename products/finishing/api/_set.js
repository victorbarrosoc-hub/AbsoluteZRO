// Repasse do Set (presença e conversas do ecossistema, ADR 0032 da Absolute ZRO): /api/zro/set/<caminho> →
// <emissor>/api/v1/set/<caminho>, com o access token da sessão no Authorization. O <zro-set> da página fala só com este
// site (cookie da sessão, mesma origem); o token fica no cookie cifrado que só /api/zro recebe e nunca chega ao
// JavaScript, ao HTML ou ao log, e o texto das mensagens também não vai a log.
//
// Só os caminhos e métodos da API do Set passam (o resto é 404). Leitura com ETag: o If-None-Match do widget segue e o
// 304 volta sem corpo. Sem sessão ou sem tokens: 401 (o widget some). Token sem zro.set (login de antes do Set): a
// Absolute ZRO responde 401 e passa, SEM apagar o cookie dos tokens (eles continuam valendo para a Z e o perfil).
// Fechado ao público (_release.js): sessão que o HUB não liberou recebe 403 antes de qualquer pedido.
// "saiu" (ao fechar a página) com o token vencido não renova: o pedido vai sem esperar resposta e não pode disputar o
// refresh token com outro pedido. Este arquivo é o mesmo no AEON e na Revela.

import { liberado } from './_release.js'
import { abrir, cifrar, configurado, cookie, COOKIE_CONTA, COOKIE_TOKENS, CONTA_S, decifrar, emissor, json, lerCookie, origemDoPedido, renovarTokens, ZroErro } from './_zro.js'

const ID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
/** Os caminhos e métodos do contrato (docs/integration-contracts/set.md da Absolute ZRO). */
const ROTAS = [
  [/^$/, ['GET', 'POST']],
  [/^preferencias$/, ['PUT']],
  [/^contatos$/, ['GET', 'POST']],
  [new RegExp(`^contatos/${ID}$`, 'i'), ['PUT', 'DELETE']],
  [/^bloqueios$/, ['POST']],
  [new RegExp(`^bloqueios/${ID}$`, 'i'), ['DELETE']],
  [/^conversas$/, ['GET', 'POST']],
  [new RegExp(`^conversas/${ID}$`, 'i'), ['GET', 'PATCH']],
  [new RegExp(`^conversas/${ID}/mensagens$`, 'i'), ['POST']],
  [new RegExp(`^mensagens/${ID}$`, 'i'), ['PATCH', 'DELETE']],
  [/^denuncias$/, ['POST']],
]
const CORPO_MAX = 20_000
/** A ETag fraca da API do Set (W/"…"): só ela vai e volta. */
const ETAG = /^W\/"[A-Za-z0-9_-]{1,64}"$/
const agoraS = () => Math.floor(Date.now() / 1000)

/** O caminho pedido (sem barras nas pontas): ?c= (reescrita da Vercel, vercel.json) ou o próprio endereço. */
export function caminhoDe(req) {
  const u = new URL(req.url || '/', 'https://site.invalid')
  const bruto = u.searchParams.get('c') ?? (u.pathname.startsWith('/api/zro/set/') ? decodeURIComponent(u.pathname.slice('/api/zro/set/'.length)) : '')
  return String(bruto).replace(/^\/+|\/+$/g, '')
}

/** Só os parâmetros de leitura da conversa seguem (números). */
function busca(req, caminho) {
  if (req.method !== 'GET' || !/^conversas\/[^/]+$/.test(caminho)) return ''
  const q = new URL(req.url || '/', 'https://site.invalid').searchParams
  const out = new URLSearchParams()
  for (const k of ['antes', 'depois', 'limite']) {
    const v = q.get(k)
    if (v && /^\d{1,15}$/.test(v)) out.set(k, v)
  }
  const s = out.toString()
  return s ? `?${s}` : ''
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
const SEM_LOGIN = 'Entre com a conta Absolute ZRO para ver o Set.'

export async function repassarSet(req, res, caminho = caminhoDe(req)) {
  const rota = ROTAS.find(([re]) => re.test(caminho))
  if (!rota) return negar(res, 404, 'Não encontrado.')
  if (!rota[1].includes(req.method)) {
    res.setHeader('Allow', rota[1].join(', '))
    return negar(res, 405, 'Método não permitido.')
  }
  // mudança só do próprio site: outra página não fala no Set em nome de ninguém
  if (req.method !== 'GET') {
    const origin = req.headers.origin
    if (origin && origin !== origemDoPedido(req)) return negar(res, 403, 'Pedido de outra origem recusado.')
    if (req.method !== 'DELETE' && !/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return negar(res, 415, 'Mande JSON.')
  }
  if (!configurado()) return negar(res, 401, SEM_LOGIN)
  const conta = abrir(COOKIE_CONTA, lerCookie(req, COOKIE_CONTA))
  // fechado ao público: só a conta que o HUB liberou fala com o Set por aqui (nada sai para a Absolute ZRO)
  if (conta && typeof conta.sub === 'string' && !liberado(conta)) return negar(res, 403, 'Em desenvolvimento.')
  let t = conta && typeof conta.sub === 'string' ? decifrar(COOKIE_TOKENS, lerCookie(req, COOKIE_TOKENS)) : null
  if (!t) return negar(res, 401, SEM_LOGIN)

  let corpo
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    corpo = await lerCorpo(req)
    if (corpo === null) return negar(res, 413, 'Mensagem grande demais.')
  }

  const cookies = []
  if (!t.at || !(t.atExp > agoraS() + 30)) {
    let saiu = false
    try {
      saiu = caminho === '' && req.method === 'POST' && JSON.parse(corpo || '{}')?.estado === 'saiu'
    } catch {
      saiu = false
    }
    if (saiu) {
      res.statusCode = 204
      res.setHeader('Cache-Control', 'no-store')
      return res.end()
    }
    try {
      t = await renovarTokens(t)
      cookies.push(cookie(COOKIE_TOKENS, cifrar(COOKIE_TOKENS, t, CONTA_S), { maxAge: CONTA_S, path: '/api/zro' }))
    } catch (e) {
      if (e instanceof ZroErro && e.message === 'recusado') return negar(res, 401, 'Entre de novo com a conta Absolute ZRO.', [cookie(COOKIE_TOKENS, '', { maxAge: 0, path: '/api/zro' })])
      return negar(res, 502, 'A Absolute ZRO não respondeu agora. Tente de novo.')
    }
  }

  const pedida = String(req.headers['if-none-match'] || '')
  const etagPedida = req.method === 'GET' && pedida.length <= 200 && ETAG.test(pedida) ? pedida : null
  let r
  try {
    r = await fetch(`${emissor()}/api/v1/set${caminho ? `/${caminho}` : ''}${busca(req, caminho)}`, {
      method: req.method,
      headers: {
        authorization: `Bearer ${t.at}`,
        accept: 'application/json',
        ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(etagPedida ? { 'if-none-match': etagPedida } : {}),
      },
      body: corpo,
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    return negar(res, 502, 'A Absolute ZRO não respondeu agora. Tente de novo.', cookies)
  }
  // login de antes do Set (token sem zro.set): o widget some; os tokens ficam (valem para a Z e o perfil)
  if (r.status === 401) {
    await r.body?.cancel().catch(() => {})
    return negar(res, 401, SEM_LOGIN, cookies)
  }
  res.statusCode = r.status
  res.setHeader('Cache-Control', 'no-store')
  const tipo = r.headers.get('content-type')
  if (tipo) res.setHeader('Content-Type', tipo)
  const etag = r.headers.get('etag')
  if (etag && ETAG.test(etag)) res.setHeader('ETag', etag)
  if (cookies.length) res.setHeader('Set-Cookie', cookies)
  if (r.status === 204 || r.status === 304 || !r.body) {
    await r.body?.cancel().catch(() => {})
    return res.end()
  }
  res.end(Buffer.from(await r.arrayBuffer()))
}
