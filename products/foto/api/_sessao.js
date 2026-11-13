// Quem está falando com o app: a sessão do login único (foto_conta) e o gate de lançamento (claim zro_release).
// Organização e pessoa vêm sempre da sessão, nunca do pedido.
//
// Modo local (só para desenvolver e para os testes de tela): sem o login configurado, com FOTO_LOCAL=1 e o pedido
// vindo de localhost, a pessoa vem do cookie foto_local (api/pagina.js cria na primeira visita; api/local.js troca o
// nome). Em produção nunca liga: a Vercel não define FOTO_LOCAL e o host não é localhost.

import { abrir, configurado, COOKIE_CONTA, lerCookie, temAcesso } from './_zro.js'

export const COOKIE_LOCAL = 'foto_local'

const hostLocal = (req) => /^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(String(req.headers.host || '').toLowerCase())

export const modoLocal = (req) => !configurado() && process.env.FOTO_LOCAL === '1' && hostLocal(req)

/** Nome de gente: sem controle, espaços juntos, até 60 caracteres. Vazio vira ''. */
export function nomeLimpo(v) {
  if (typeof v !== 'string') return ''
  return v
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

/** O valor do cookie foto_local de uma pessoa de teste. */
export const selarLocal = (sub, nome) => Buffer.from(JSON.stringify({ sub, nome })).toString('base64url')

/** A pessoa da sessão, já passada pelo gate, ou null. { sub, nome, foto, org } (foto: o id público da foto da conta) */
export function pessoaDe(req) {
  if (modoLocal(req)) {
    const v = lerCookie(req, COOKIE_LOCAL)
    if (!v || v.length > 600) return null
    try {
      const d = JSON.parse(Buffer.from(v, 'base64url').toString('utf8'))
      if (typeof d?.sub !== 'string' || !/^local-[a-z0-9]{8,32}$/.test(d.sub)) return null
      return { sub: d.sub, nome: nomeLimpo(d.nome) || 'Pessoa', foto: null, org: null }
    } catch {
      return null
    }
  }
  const c = abrir(COOKIE_CONTA, lerCookie(req, COOKIE_CONTA))
  if (!c || typeof c.sub !== 'string' || !temAcesso(c.apps)) return null
  // a foto da conta: só o id público do fim de /api/v1/foto/<id> (o endereço já foi conferido contra a Absolute ZRO no login)
  const foto = (typeof c.foto === 'string' && /\/api\/v1\/foto\/([A-Za-z0-9_-]{8,80})$/.exec(c.foto)?.[1]) || null
  const org = typeof c.org?.id === 'string' && c.org.id ? c.org.id : null
  return { sub: c.sub, nome: nomeLimpo(c.nome) || nomeLimpo(String(c.email || '').split('@')[0]) || 'Pessoa', foto, org }
}

/** Corpo JSON do pedido (a Vercel já entrega em req.body; o servidor local, não). Até 64 KB por padrão. */
export async function lerJson(req, maximo = 65536) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}')
  if (Buffer.isBuffer(req.body)) return req.body.length > maximo ? Promise.reject(new Error('grande')) : JSON.parse(req.body.toString('utf8') || '{}')
  let tam = 0
  const partes = []
  for await (const p of req) {
    tam += p.length
    if (tam > maximo) throw new Error('grande')
    partes.push(p)
  }
  const t = Buffer.concat(partes).toString('utf8')
  return t ? JSON.parse(t) : {}
}
