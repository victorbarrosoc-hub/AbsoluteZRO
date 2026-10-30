// /api/zro/set/* — repasse do Set (presença e conversas do ecossistema, ADR 0032 da Absolute ZRO) para
// https://absolutezro.com/api/v1/set/*. O <zro-set api="/api/zro/set"> da aba Set fala só com o próprio app; aqui o
// servidor acrescenta o access token da sessão (cofre tp_zro_hub, escopo zro.set) e devolve a resposta como veio. O token
// nunca vai para a página nem para log, e o texto das mensagens também não vai a log.
//
// Caminho: a Vercel reescreve /api/zro/set/<caminho> para /api/zro/set?c=<caminho> (vercel.json); nos testes e no
// servidor local o caminho vem direto no endereço. Só os caminhos e métodos da API do Set passam; o resto é 404.
// Leitura com ETag: o If-None-Match do widget segue e o 304 (sem corpo) volta, então o poll não traz o que não mudou.
// Sem sessão, ou login de antes do Set (token sem zro.set): 401 e o widget some sem alarde. Diferente da Z, um 401 da
// Absolute ZRO aqui não apaga o cofre: os mesmos tokens continuam valendo para a Z e para o perfil.

import { COOKIE_HUB, COOKIE_SESSAO, DURACAO_SESSAO_S, ZroError, abrir, cifrar, config, configurado, decifrar, json, lerCookie, origemDoPedido, seguro, serializarCookie, tokenValido } from './_zro.mjs'

const ID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
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
const SEM_LOGIN = 'Entre com a conta Absolute ZRO para ver o Set.'

/** O caminho pedido (sem barras nas pontas), de ?c= (reescrita da Vercel) ou do próprio endereço. */
export function caminhoDe(url) {
  const u = new URL(url || '/', 'https://tpeasy.invalid')
  const bruto = u.searchParams.get('c') ?? (u.pathname.startsWith('/api/zro/set/') ? decodeURIComponent(u.pathname.slice('/api/zro/set/'.length)) : '')
  return String(bruto).replace(/^\/+|\/+$/g, '')
}

/** Só os parâmetros de leitura da conversa seguem (números). */
function busca(url, caminho, metodo) {
  if (metodo !== 'GET' || !/^conversas\/[^/]+$/.test(caminho)) return ''
  const q = new URL(url || '/', 'https://tpeasy.invalid').searchParams
  const out = new URLSearchParams()
  for (const k of ['antes', 'depois', 'limite']) {
    const v = q.get(k)
    if (v && /^\d{1,15}$/.test(v)) out.set(k, v)
  }
  const s = out.toString()
  return s ? `?${s}` : ''
}

async function lerCorpo(req) {
  const partes = []
  let n = 0
  for await (const c of req) {
    n += c.length
    if (n > CORPO_MAX) return null
    partes.push(c)
  }
  return Buffer.concat(partes)
}

const ehSaida = (caminho, metodo, corpo) => {
  if (caminho !== '' || metodo !== 'POST' || !corpo) return false
  try {
    return JSON.parse(corpo.toString('utf8'))?.estado === 'saiu'
  } catch {
    return false
  }
}

export default async function set(req, res) {
  const caminho = caminhoDe(req.url)
  const rota = ROTAS.find(([re]) => re.test(caminho))
  if (!rota) return json(res, 404, { message: 'Não encontrado.' })
  if (!rota[1].includes(req.method)) {
    res.setHeader('Allow', rota[1].join(', '))
    return json(res, 405, { message: 'Método não aceito.' })
  }
  // só o próprio site mexe por aqui (outra página não usa a sessão de ninguém)
  if (req.method !== 'GET') {
    const origin = req.headers.origin
    if (origin && origin !== origemDoPedido(req)) return json(res, 403, { message: 'Pedido de outra origem recusado.' })
    const site = req.headers['sec-fetch-site']
    if (site && site !== 'same-origin' && site !== 'none') return json(res, 403, { message: 'Pedido de outra origem recusado.' })
    if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return json(res, 415, { message: 'Mande JSON.' })
  }
  if (!configurado()) return json(res, 401, { message: SEM_LOGIN, configurado: false })

  const c = abrir(lerCookie(req, COOKIE_SESSAO), 'sessao')
  let hub = null
  try {
    hub = decifrar(lerCookie(req, COOKIE_HUB))
  } catch {
    hub = null
  }
  if (!c || typeof c.sub !== 'string' || !hub || hub.sub !== c.sub) return json(res, 401, { message: SEM_LOGIN, reconectar: true })

  let corpo
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    corpo = await lerCorpo(req)
    if (!corpo) return json(res, 413, { message: 'Mensagem grande demais.' })
  }

  // "saiu" ao fechar a página não renova o token (o pedido vai sem esperar resposta e não deve disputar o refresh)
  if (!(typeof hub.at === 'string' && hub.atExp > Math.floor(Date.now() / 1000) + 30) && ehSaida(caminho, req.method, corpo)) {
    res.statusCode = 204
    res.setHeader('Cache-Control', 'no-store')
    return res.end()
  }
  const secure = seguro(req)
  const cookies = []
  let tokens
  try {
    const t = await tokenValido(hub)
    tokens = t.tokens
    if (t.renovou) cookies.push(serializarCookie(COOKIE_HUB, cifrar({ sub: c.sub, ...tokens }), { path: '/api/zro', secure, maxAge: DURACAO_SESSAO_S }))
  } catch (e) {
    if (e instanceof ZroError && e.codigo === 'revogado') return json(res, 401, { message: SEM_LOGIN, reconectar: true }, [serializarCookie(COOKIE_HUB, '', { path: '/api/zro', secure, maxAge: 0 })])
    return json(res, 502, { message: 'A Absolute ZRO não respondeu agora. Tente de novo.' })
  }

  const pedida = String(req.headers['if-none-match'] || '')
  const etagPedida = req.method === 'GET' && pedida.length <= 200 && ETAG.test(pedida) ? pedida : null
  let r
  try {
    r = await fetch(`${config().emissor}/api/v1/set${caminho ? `/${caminho}` : ''}${busca(req.url, caminho, req.method)}`, {
      method: req.method,
      headers: {
        authorization: `Bearer ${tokens.at}`,
        accept: 'application/json',
        ...(corpo ? { 'content-type': 'application/json' } : {}),
        ...(etagPedida ? { 'if-none-match': etagPedida } : {}),
      },
      body: corpo,
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    return json(res, 502, { message: 'A Absolute ZRO não respondeu agora. Tente de novo.' }, cookies)
  }
  // login de antes do Set (token sem zro.set): o widget some; o cofre fica (vale para a Z e o perfil)
  if (r.status === 401) {
    await r.body?.cancel().catch(() => {})
    return json(res, 401, { message: SEM_LOGIN, reconectar: true }, cookies)
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
