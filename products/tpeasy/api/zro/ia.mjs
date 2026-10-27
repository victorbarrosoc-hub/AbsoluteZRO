// /api/zro/ia/* — repasse da Z (a IA do ecossistema) para https://absolutezro.com/api/v1/ia/*. O painel no topo de
// Roteiros (<zro-ia api="/api/zro/ia">) fala só com o próprio site; aqui o servidor acrescenta o access token da sessão
// (cofre tp_zro_hub, escopo zro.ia) e devolve a resposta como veio, inclusive o NDJSON de /mensagens, sem esperar o
// fim. O token nunca vai para a página nem para log. A conversa fica atribuída ao TPeasy pelo cliente do token.
//
// Caminho: a Vercel reescreve /api/zro/ia/<caminho> para /api/zro/ia?c=<caminho> (vercel.json); nos testes o caminho
// vem direto no endereço. Só passam: estado, conversas, conversas/<id>, mensagens.
// Sem sessão, ou com um login de antes da Z (token sem zro.ia: 401 mesmo depois de renovar): 401 com `reconectar`, e a
// página oferece "Entrar com Absolute ZRO" de novo (o novo login já pede zro.ia).
import { COOKIE_HUB, COOKIE_SESSAO, DURACAO_SESSAO_S, ZroError, abrir, cifrar, config, configurado, decifrar, json, lerCookie, origemDoPedido, seguro, serializarCookie, tokenValido } from './_zro.mjs'

const ROTAS = [
  [/^estado$/, ['GET']],
  [/^conversas$/, ['GET']],
  [/^conversas\/[A-Za-z0-9-]{1,64}$/, ['GET', 'DELETE']],
  [/^mensagens$/, ['POST']],
]
const CORPO_MAX = 64 * 1024
const SEM_LOGIN = 'Entre com a conta Absolute ZRO para conversar com a Z.'

/** O caminho pedido (sem barras nas pontas), de ?c= (reescrita da Vercel) ou do próprio endereço. */
export function caminhoDe(url) {
  const u = new URL(url || '/', 'https://tpeasy.invalid')
  const bruto = u.searchParams.get('c') ?? (u.pathname.startsWith('/api/zro/ia/') ? decodeURIComponent(u.pathname.slice('/api/zro/ia/'.length)) : '')
  return String(bruto).replace(/^\/+|\/+$/g, '')
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

export default async function ia(req, res) {
  const caminho = caminhoDe(req.url)
  const rota = ROTAS.find(([re]) => re.test(caminho))
  if (!rota) return json(res, 404, { message: 'Caminho desconhecido.' })
  if (!rota[1].includes(req.method)) {
    res.setHeader('Allow', rota[1].join(', '))
    return json(res, 405, { message: 'Método não aceito.' })
  }
  // só o próprio app conversa por aqui (outra página não usa a sessão de ninguém)
  if (req.method !== 'GET') {
    const vindoDe = req.headers.origin
    if (vindoDe && vindoDe !== origemDoPedido(req)) return json(res, 403, { message: 'Origem recusada.' })
    const site = req.headers['sec-fetch-site']
    if (site && site !== 'same-origin' && site !== 'none') return json(res, 403, { message: 'Origem recusada.' })
  }
  if (!configurado()) return json(res, 401, { message: SEM_LOGIN, configurado: false })

  const s = abrir(lerCookie(req, COOKIE_SESSAO), 'sessao')
  let hub = null
  try {
    hub = decifrar(lerCookie(req, COOKIE_HUB))
  } catch {
    hub = null
  }
  if (!s || typeof s.sub !== 'string' || !hub || hub.sub !== s.sub) return json(res, 401, { message: SEM_LOGIN, reconectar: true })

  let corpo
  if (req.method === 'POST') {
    corpo = await lerCorpo(req)
    if (!corpo) return json(res, 413, { message: 'Mensagem grande demais.' })
  }

  const secure = seguro(req)
  const cookies = []
  const guardar = (t) => cookies.splice(0, cookies.length, serializarCookie(COOKIE_HUB, cifrar({ sub: s.sub, ...t }), { path: '/api/zro', secure, maxAge: DURACAO_SESSAO_S }))
  const fim = new AbortController()
  res.on('close', () => fim.abort())
  const pedir = (at) =>
    fetch(`${config().emissor}/api/v1/ia/${caminho}`, {
      method: req.method,
      headers: { Authorization: `Bearer ${at}`, Accept: req.headers.accept || 'application/json', ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo,
      signal: fim.signal,
      redirect: 'manual',
    })

  let r
  try {
    let { tokens, renovou } = await tokenValido(hub)
    if (renovou) guardar(tokens)
    r = await pedir(tokens.at)
    if (r.status === 401 && !renovou) {
      await r.body?.cancel().catch(() => {})
      ;({ tokens } = await tokenValido(tokens, { forcar: true }))
      guardar(tokens)
      r = await pedir(tokens.at)
    }
  } catch (e) {
    if (e instanceof ZroError && e.codigo === 'revogado') return json(res, 401, { message: SEM_LOGIN, reconectar: true }, [serializarCookie(COOKIE_HUB, '', { path: '/api/zro', secure, maxAge: 0 })])
    if (fim.signal.aborted) return res.end()
    return json(res, 502, { message: 'A Z não respondeu agora. Tente de novo.' }, cookies)
  }
  // login de antes da Z (token sem zro.ia): a pessoa entra de novo e o novo login já pede a Z
  if (r.status === 401) {
    await r.body?.cancel().catch(() => {})
    return json(res, 401, { message: SEM_LOGIN, reconectar: true }, cookies)
  }

  res.statusCode = r.status
  res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Accel-Buffering', 'no')
  if (cookies.length) res.setHeader('Set-Cookie', cookies)
  if (!r.body) return res.end()
  res.flushHeaders?.()
  try {
    // NDJSON de /mensagens: cada pedaço segue para a página assim que chega
    for await (const pedaco of r.body) res.write(pedaco)
  } catch {
    // a página fechou (parar) ou o HUB caiu no meio: termina o que já foi
  }
  res.end()
}
