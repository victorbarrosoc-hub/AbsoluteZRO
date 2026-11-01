// Repasse dos sons da Sonoplasta pela Absolute ZRO: os originais da plataforma (/api/zro/sons/zro e /zro/<id>), os
// livres (/api/zro/sons/buscar?q&pagina e /openverse/<id>) e o banco da pessoa no Drive (/api/zro/sons/banco?pasta&q&pagina&conta e /banco/<id>?conta) → <emissor>/api/v1/sons/…,
// com o access token da sessão no Authorization. A página fala
// só com este site (cookie da sessão, mesma origem); o token fica no cookie cifrado que só /api/zro recebe.
// Só leitura (GET) e só estes caminhos, com os parâmetros conferidos; o arquivo de som passa aos poucos, com o tipo e
// os cabeçalhos X-Zro-Som-*.
// Sem sessão ou sem tokens: 401. Token sem zro.sons (login de antes da Sonoplasta): a Absolute ZRO responde 401 e passa,
// sem apagar o cookie dos tokens (eles continuam valendo para a Z e o Set). Fechado ao público: 403 antes de tudo.

import { liberado } from './_release.js'
import { abrir, cifrar, configurado, cookie, COOKIE_CONTA, COOKIE_TOKENS, CONTA_S, decifrar, emissor, json, lerCookie, renovarTokens, ZroErro } from './_zro.js'

const OPENVERSE = /^\/openverse\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const BANCO = /^\/banco\/[A-Za-z0-9_-]{10,200}$/
const ZRO = /^\/zro\/(?=.{3,100}$)[a-z0-9]+(-[a-z0-9]+)*$/
const PASSAM = ['content-type', 'content-length', 'x-zro-som-id', 'x-zro-som-titulo', 'x-zro-som-autor', 'x-zro-som-licenca']
const PRAZO_MS = 30_000
const agoraS = () => Math.floor(Date.now() / 1000)

export const caminhoDe = (req) => new URL(req.url || '/', 'https://site.invalid').pathname.replace(/^\/api\/zro\/sons(?=\/|$)/, '')

const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/
const CONTA = /^[A-Za-z0-9_-]{1,64}$/

/**
 * A consulta que segue para a Absolute ZRO em cada caminho, só com os parâmetros conferidos (o resto não sai daqui).
 * null: caminho fora do contrato.
 */
export function consultaDe(caminho, q) {
  const so = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v)).toString()
  const conta = CONTA.test(q.get('conta') || '') ? q.get('conta') : ''
  if (caminho === '/buscar') return so({ q: String(q.get('q') || '').slice(0, 80), pagina: /^\d{1,2}$/.test(q.get('pagina') || '') ? q.get('pagina') : '1' })
  if (caminho === '/banco') {
    const pagina = String(q.get('pagina') || '')
    return so({ pasta: DRIVE_ID.test(q.get('pasta') || '') ? q.get('pasta') : 'x', q: String(q.get('q') || '').slice(0, 80), pagina: pagina.length <= 2000 ? pagina : '', conta })
  }
  if (BANCO.test(caminho)) return so({ conta })
  if (OPENVERSE.test(caminho) || caminho === '/zro' || ZRO.test(caminho)) return ''
  return null
}

const negar = (res, status, message, cookies = []) => json(res, status, { ok: false, message }, cookies)

export async function repassarSons(req, res, caminho = caminhoDe(req)) {
  const consulta = consultaDe(caminho, new URL(req.url || '/', 'https://site.invalid').searchParams)
  if (consulta === null) return negar(res, 404, 'Não encontrado.')
  const lista = caminho === '/buscar' || caminho === '/banco' || caminho === '/zro'
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
    r = await fetch(`${emissor()}/api/v1/sons${caminho}${consulta ? `?${consulta}` : ''}`, {
      headers: { authorization: `Bearer ${t.at}`, accept: lista ? 'application/json' : 'audio/*' },
      signal: ctrl.signal,
      redirect: 'manual',
    })
  } catch {
    clearTimeout(prazo)
    return negar(res, 502, 'A Absolute ZRO não respondeu agora.', cookies)
  }
  res.statusCode = r.status
  for (const k of PASSAM) if (r.headers.get(k)) res.setHeader(k, r.headers.get(k))
  res.setHeader('Cache-Control', lista || BANCO.test(caminho) ? 'no-store' : ZRO.test(caminho) ? 'private, max-age=86400' : 'private, max-age=3600')
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
