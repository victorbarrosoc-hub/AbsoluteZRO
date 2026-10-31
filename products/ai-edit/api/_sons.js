// Repasse dos sons da Sonoplasta (efeitos sonoros livres, pela Absolute ZRO): /api/zro/sons/buscar?q&pagina e
// /api/zro/sons/openverse/<id> → <emissor>/api/v1/sons/…, com o access token da sessão no Authorization. A página fala
// só com este site (cookie da sessão, mesma origem); o token fica no cookie cifrado que só /api/zro recebe.
// Só leitura (GET) e só estes dois caminhos; o arquivo de som passa aos poucos, com o tipo e os cabeçalhos X-Zro-Som-*.
// Sem sessão ou sem tokens: 401. Token sem zro.sons (login de antes da Sonoplasta): a Absolute ZRO responde 401 e passa,
// sem apagar o cookie dos tokens (eles continuam valendo para a Z e o Set). Fechado ao público: 403 antes de tudo.

import { liberado } from './_release.js'
import { abrir, cifrar, configurado, cookie, COOKIE_CONTA, COOKIE_TOKENS, CONTA_S, decifrar, emissor, json, lerCookie, renovarTokens, ZroErro } from './_zro.js'

const ID = /^\/openverse\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const PASSAM = ['content-type', 'content-length', 'x-zro-som-id', 'x-zro-som-titulo', 'x-zro-som-autor', 'x-zro-som-licenca']
const PRAZO_MS = 30_000
const agoraS = () => Math.floor(Date.now() / 1000)

export const caminhoDe = (req) => new URL(req.url || '/', 'https://site.invalid').pathname.replace(/^\/api\/zro\/sons(?=\/|$)/, '')

/** Só os parâmetros da busca, conferidos (o resto não sai daqui). */
function consultaDaBusca(req) {
  const q = new URL(req.url || '/', 'https://site.invalid').searchParams
  const termo = String(q.get('q') || '').slice(0, 80)
  const pagina = /^\d{1,2}$/.test(q.get('pagina') || '') ? q.get('pagina') : '1'
  return new URLSearchParams({ q: termo, pagina }).toString()
}

const negar = (res, status, message, cookies = []) => json(res, status, { ok: false, message }, cookies)

export async function repassarSons(req, res, caminho = caminhoDe(req)) {
  const busca = caminho === '/buscar'
  if (!busca && !ID.test(caminho)) return negar(res, 404, 'Não encontrado.')
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return negar(res, 405, 'Método não permitido.')
  }
  if (!configurado()) return negar(res, 503, 'O login com a Absolute ZRO não está ligado aqui.')
  const conta = abrir(COOKIE_CONTA, lerCookie(req, COOKIE_CONTA))
  if (conta && typeof conta.sub === 'string' && !liberado(conta)) return negar(res, 403, 'Em desenvolvimento.')
  let t = conta && typeof conta.sub === 'string' ? decifrar(COOKIE_TOKENS, lerCookie(req, COOKIE_TOKENS)) : null
  if (!t) return negar(res, 401, 'Entre com a conta Absolute ZRO para buscar sons.')
  const cookies = []
  if (!t.at || !(t.atExp > agoraS() + 30)) {
    try {
      t = await renovarTokens(t)
      cookies.push(cookie(COOKIE_TOKENS, cifrar(COOKIE_TOKENS, t, CONTA_S), { maxAge: CONTA_S, path: '/api/zro' }))
    } catch (e) {
      if (e instanceof ZroErro && e.message === 'recusado') return negar(res, 401, 'Entre de novo com a conta Absolute ZRO.', [cookie(COOKIE_TOKENS, '', { maxAge: 0, path: '/api/zro' })])
      return negar(res, 502, 'A Absolute ZRO não respondeu agora.')
    }
  }
  const ctrl = new AbortController()
  const prazo = setTimeout(() => ctrl.abort(), PRAZO_MS)
  res.on('close', () => {
    if (!res.writableEnded) ctrl.abort()
  })
  let r
  try {
    r = await fetch(`${emissor()}/api/v1/sons${caminho}${busca ? `?${consultaDaBusca(req)}` : ''}`, {
      headers: { authorization: `Bearer ${t.at}`, accept: busca ? 'application/json' : 'audio/*' },
      signal: ctrl.signal,
      redirect: 'manual',
    })
  } catch {
    clearTimeout(prazo)
    return negar(res, 502, 'A Absolute ZRO não respondeu agora.', cookies)
  }
  res.statusCode = r.status
  for (const k of PASSAM) if (r.headers.get(k)) res.setHeader(k, r.headers.get(k))
  res.setHeader('Cache-Control', busca ? 'no-store' : 'private, max-age=3600')
  if (cookies.length) res.setHeader('Set-Cookie', cookies)
  try {
    if (r.body) for await (const pedaco of r.body) res.write(pedaco)
  } catch {
    // a fonte caiu no meio (ou a pessoa fechou): fecha o que já foi
  } finally {
    clearTimeout(prazo)
    res.end()
  }
}
