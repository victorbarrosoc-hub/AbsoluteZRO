// Repasse da Z (a IA do ecossistema Absolute ZRO): /api/zro/ia/<caminho> → <emissor>/api/v1/ia/<caminho>, com o
// access token da sessão no Authorization. O <zro-ia> da página fala só com este site (cookie da sessão, mesma
// origem); o token fica no cookie cifrado que só /api/zro recebe e nunca chega ao JavaScript, ao HTML ou ao log.
// A resposta da Z (NDJSON) passa pedaço a pedaço, sem juntar na memória.
//
// Sem sessão, sem tokens ou com o refresh recusado: 401 (o <zro-ia> avisa zro-ia:sem-login e a página oferece
// entrar de novo, já pedindo o escopo zro.ia). Token sem zro.ia (login antigo): a Absolute ZRO responde 401 e passa.
// Este arquivo é o mesmo no AEON e na Revela; os nomes dos cookies vêm de _zro.js.

import { abrir, cifrar, configurado, cookie, COOKIE_CONTA, COOKIE_TOKENS, CONTA_S, decifrar, emissor, json, lerCookie, origemDoPedido, renovarTokens, ZroErro } from './_zro.js'

/** Só estes caminhos e métodos (os do contrato da API da Z); o resto nem sai daqui. */
const ROTAS = [
  [/^\/estado$/, ['GET']],
  [/^\/conversas$/, ['GET']],
  [/^\/conversas\/[\w-]{1,64}$/, ['GET', 'DELETE']],
  [/^\/mensagens$/, ['POST']],
]
const CORPO_MAX = 64 * 1024
// uma resposta da Z pode levar um tempo (lê dados da conta, escreve aos poucos), mas não fica pendurada para sempre
const PRAZO_MS = 120_000
const agoraS = () => Math.floor(Date.now() / 1000)

export const caminhoDe = (req) => new URL(req.url || '/', 'https://site.invalid').pathname.replace(/^\/api\/zro\/ia(?=\/|$)/, '')

async function lerCorpo(req) {
  // a Vercel pode já ter lido o corpo (req.body); no servidor http puro, lê o fluxo
  if (req.body !== undefined && req.body !== null) return typeof req.body === 'string' || Buffer.isBuffer(req.body) ? String(req.body) : JSON.stringify(req.body)
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

export async function repassar(req, res, caminho = caminhoDe(req)) {
  const rota = ROTAS.find(([re]) => re.test(caminho))
  if (!rota) return negar(res, 404, 'Não encontrado.')
  if (!rota[1].includes(req.method)) {
    res.setHeader('Allow', rota[1].join(', '))
    return negar(res, 405, 'Método não permitido.')
  }
  // mudança (mandar mensagem, apagar conversa) só do próprio site: outra página não fala com a Z em nome de ninguém
  if (req.method !== 'GET') {
    const origin = req.headers.origin
    if (origin && origin !== origemDoPedido(req)) return negar(res, 403, 'Pedido de outra origem recusado.')
    if (req.method === 'POST' && !/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return negar(res, 415, 'Mande JSON.')
  }
  if (!configurado()) return negar(res, 503, 'O login com a Absolute ZRO não está ligado aqui.')
  const conta = abrir(COOKIE_CONTA, lerCookie(req, COOKIE_CONTA))
  let t = conta && typeof conta.sub === 'string' ? decifrar(COOKIE_TOKENS, lerCookie(req, COOKIE_TOKENS)) : null
  if (!t) return negar(res, 401, 'Entre com a conta Absolute ZRO para conversar com a Z.')

  const cookies = []
  if (!t.at || !(t.atExp > agoraS() + 30)) {
    try {
      t = await renovarTokens(t)
      cookies.push(cookie(COOKIE_TOKENS, cifrar(COOKIE_TOKENS, t, CONTA_S), { maxAge: CONTA_S, path: '/api/zro' }))
    } catch (e) {
      if (e instanceof ZroErro && e.message === 'recusado') return negar(res, 401, 'Entre de novo com a conta Absolute ZRO.', [cookie(COOKIE_TOKENS, '', { maxAge: 0, path: '/api/zro' })])
      return negar(res, 502, 'Sem conexão com a Z agora.')
    }
  }

  let corpo
  if (req.method === 'POST') {
    corpo = await lerCorpo(req)
    if (corpo === null) return negar(res, 413, 'Mensagem grande demais.')
  }

  const ctrl = new AbortController()
  const prazo = setTimeout(() => ctrl.abort(), PRAZO_MS)
  // a pessoa parou a resposta (ou fechou a página): a Z para também
  res.on('close', () => {
    if (!res.writableEnded) ctrl.abort()
  })
  let r
  try {
    r = await fetch(`${emissor()}/api/v1/ia${caminho}`, {
      method: req.method,
      headers: { authorization: `Bearer ${t.at}`, accept: req.method === 'POST' ? 'application/x-ndjson, application/json' : 'application/json', ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: corpo,
      signal: ctrl.signal,
      redirect: 'manual',
    })
  } catch {
    clearTimeout(prazo)
    return negar(res, 502, 'Sem conexão com a Z agora.', cookies)
  }
  res.statusCode = r.status
  res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  // proxies e a própria Vercel não juntam a resposta antes de mandar
  res.setHeader('X-Accel-Buffering', 'no')
  if (cookies.length) res.setHeader('Set-Cookie', cookies)
  try {
    if (r.body) for await (const pedaco of r.body) res.write(pedaco)
  } catch {
    // a Z caiu no meio (ou a pessoa parou): fecha o que já foi
  } finally {
    clearTimeout(prazo)
    res.end()
  }
}
