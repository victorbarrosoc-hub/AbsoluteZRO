// /api/zro/entregas — a caixa de entrada do TPeasy na Absolute ZRO (Criação F8 do Maestro, migração 0040 do HUB;
// contrato em docs/integration-contracts/maestro-tpeasy.md na raiz). O TPeasy não tem banco: os roteiros que o Maestro
// manda ficam no HUB por 30 dias e cada aparelho busca o que chegou ao abrir o app.
//
// - GET ?desde=<iso>: repassa para https://absolutezro.com/api/v1/apps/entregas/recebidas?destino=tpeasy[&desde=] com o
//   access token da sessão (cofre tp_zro_hub, escopo tpeasy.roteiros) e devolve { entregas, agora } como veio.
// - POST { ids }: o aparelho conta o que gravou (o Maestro mostra "Recebido").
// O token nunca vai para a página nem para log; o texto dos roteiros também não vai a log. Sem sessão, ou login de antes
// da 0040 (token sem tpeasy.roteiros): 401 { reconectar } e o app segue como antes. Um 401 do HUB aqui não apaga o
// cofre (os mesmos tokens continuam valendo para a Z, o Set e o perfil).

import { COOKIE_HUB, COOKIE_SESSAO, DURACAO_SESSAO_S, ZroError, abrir, cifrar, config, configurado, decifrar, json, lerCookie, origemDoPedido, seguro, serializarCookie, tokenValido } from './_zro.mjs'

const CORPO_MAX = 10_000
const RESPOSTA_MAX = 12_000_000
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SEM_LOGIN = 'Entre com a conta Absolute ZRO para receber roteiros do Maestro.'

/** `desde` só passa se for uma data ISO. */
export function desdeDe(url) {
  const v = new URL(url || '/', 'https://tpeasy.invalid').searchParams.get('desde')
  return v && v.length <= 40 && /^\d{4}-\d\d-\d\dT[\d:.]+(Z|[+-]\d\d:\d\d)$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null
}

async function lerIds(req) {
  const partes = []
  let n = 0
  for await (const c of req) {
    n += c.length
    if (n > CORPO_MAX) return null
    partes.push(c)
  }
  try {
    const j = JSON.parse(Buffer.concat(partes).toString('utf8'))
    const ids = Array.isArray(j?.ids) ? j.ids.filter((x) => typeof x === 'string' && ID.test(x)).slice(0, 100) : []
    return ids.length ? ids : null
  } catch {
    return null
  }
}

export default async function entregas(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return json(res, 405, { message: 'Método não aceito.' })
  }
  if (req.method === 'POST') {
    // só o próprio site conta o que gravou (outra página não usa a sessão de ninguém)
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
  if (req.method === 'POST') {
    const ids = await lerIds(req)
    if (!ids) return json(res, 400, { message: 'Mande os ids do que chegou.' })
    corpo = JSON.stringify({ ids })
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
    return json(res, 502, { message: 'A Absolute ZRO não respondeu agora.' })
  }

  const desde = req.method === 'GET' ? desdeDe(req.url) : null
  const destino = `${config().emissor}/api/v1/apps/entregas/recebidas${req.method === 'GET' ? `?destino=tpeasy${desde ? `&desde=${encodeURIComponent(desde)}` : ''}` : ''}`
  let r
  try {
    r = await fetch(destino, {
      method: req.method,
      headers: { authorization: `Bearer ${tokens.at}`, accept: 'application/json', ...(corpo ? { 'content-type': 'application/json' } : {}) },
      body: corpo,
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    return json(res, 502, { message: 'A Absolute ZRO não respondeu agora.' }, cookies)
  }
  // login de antes da 0040 (token sem tpeasy.roteiros) ou conta sem o TPeasy: o app segue sem a caixa; o cofre fica
  if (r.status === 401 || r.status === 403) {
    await r.body?.cancel().catch(() => {})
    return json(res, r.status, { message: SEM_LOGIN, reconectar: r.status === 401 }, cookies)
  }
  const texto = await r.text()
  if (texto.length > RESPOSTA_MAX) return json(res, 502, { message: 'Resposta grande demais.' }, cookies)
  res.statusCode = r.status
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json')
  if (cookies.length) res.setHeader('Set-Cookie', cookies)
  res.end(texto)
}
