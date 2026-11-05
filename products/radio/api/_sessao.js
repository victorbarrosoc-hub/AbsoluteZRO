// Quem está falando com o rádio: a sessão do login único (rd_conta) e o gate de lançamento (claim zro_release).
// Organização e pessoa vêm sempre da sessão, nunca do pedido.
//
// Modo local (só para desenvolver e para os testes): sem o login configurado, com RADIO_LOCAL=1 e o pedido vindo de
// localhost, a pessoa vem do cookie rd_local (nome escolhido na tela). Em produção nunca liga: a Vercel não define
// RADIO_LOCAL e o host não é localhost.

import { abrir, configurado, COOKIE_CONTA, lerCookie, temAcesso } from './_zro.js'

const hostLocal = (req) => /^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(String(req.headers.host || '').toLowerCase())

export const modoLocal = (req) => !configurado() && process.env.RADIO_LOCAL === '1' && hostLocal(req)

/** A pessoa da sessão, já passada pelo gate, ou null. { sub, nome, org } */
export function pessoaDe(req) {
  if (modoLocal(req)) {
    const v = lerCookie(req, 'rd_local')
    if (!v || v.length > 600) return null
    try {
      const d = JSON.parse(Buffer.from(v, 'base64url').toString('utf8'))
      if (typeof d?.sub !== 'string' || !/^local-[a-z0-9]{8,32}$/.test(d.sub)) return null
      return { sub: d.sub, nome: nomeLimpo(d.nome) || 'Pessoa', org: null }
    } catch {
      return null
    }
  }
  const c = abrir(COOKIE_CONTA, lerCookie(req, COOKIE_CONTA))
  if (!c || typeof c.sub !== 'string' || !temAcesso(c.apps)) return null
  return { sub: c.sub, nome: nomeLimpo(c.nome) || nomeLimpo(String(c.email || '').split('@')[0]) || 'Pessoa', org: c.org?.id || null }
}

/** Nome de exibição: sem controle nem bidi, até 60. */
export function nomeLimpo(v) {
  if (typeof v !== 'string') return null
  const s = v.replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, '').trim().slice(0, 60)
  return s || null
}

/** Corpo JSON do pedido (a Vercel já entrega em req.body; o servidor local, não). Até 64 KB. */
export async function lerJson(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}')
  let tam = 0
  const partes = []
  for await (const p of req) {
    tam += p.length
    if (tam > 65536) throw new Error('grande')
    partes.push(p)
  }
  const t = Buffer.concat(partes).toString('utf8')
  return t ? JSON.parse(t) : {}
}
