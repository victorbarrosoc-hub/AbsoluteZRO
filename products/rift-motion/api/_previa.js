// Porta de prévia por chave (decisão do titular, 09/11/2026: "Sim, em todos"): para testar o Rift num projeto Vercel
// grátis à parte (team ZROFREE), sem o login da Absolute ZRO. Mesma variável de todos os apps não lançados:
// ZRO_CHAVE_PREVIA (24+ caracteres; menor = a porta não existe).
//
// - Sem a variável (o projeto oficial `rift-motion` não define): nada muda. O site sai do estático, como sempre.
// - Com ela: o build (publicar.mjs) deixa fora do estático a página, os scripts e a marca; eles saem por
//   api/pagina.js e api/recurso.js só para quem tem o cookie rf_previa, e toda rota de api/ responde a página neutra
//   (404) para quem não tem. GET /previa?chave=<a chave> confere em tempo constante e grava o cookie (o HMAC-SHA256 da
//   chave, nunca a chave; HttpOnly, Secure, SameSite=Lax, 30 dias). Chave errada: a mesma página neutra, sem pista.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'

export const COOKIE_PREVIA = 'rf_previa'
export const PREVIA_S = 30 * 24 * 3600

/** A chave, se estiver configurada e for comprida o bastante (24+ caracteres). */
export function chavePrevia() {
  const k = String(process.env.ZRO_CHAVE_PREVIA || '').trim()
  return k.length >= 24 ? k : null
}
export const previaLigada = () => Boolean(chavePrevia())

/** O valor do cookie: HMAC da chave (o cookie nunca carrega a chave). */
export const selo = (chave) => createHmac('sha256', chave).update('rift:previa:v1').digest('base64url')

const iguais = (a, b) => {
  const x = Buffer.from(String(a))
  const y = Buffer.from(String(b))
  return x.length === y.length && timingSafeEqual(x, y)
}

function lerCookie(req, nome) {
  for (const parte of String(req.headers?.cookie || '').split(';')) {
    const i = parte.indexOf('=')
    if (i > 0 && parte.slice(0, i).trim() === nome) return decodeURIComponent(parte.slice(i + 1).trim())
  }
  return undefined
}

/** A chave digitada confere com a configurada (tempo constante). */
export function chaveConfere(digitada) {
  const k = chavePrevia()
  return Boolean(k && typeof digitada === 'string' && digitada.length <= 256 && iguais(digitada, k))
}

/** O pedido traz o cookie certo da prévia. */
export function emPrevia(req) {
  const k = chavePrevia()
  if (!k) return false
  const v = lerCookie(req, COOKIE_PREVIA)
  return Boolean(v && v.length < 100 && iguais(v, selo(k)))
}

export const cookiePrevia = () => `${COOKIE_PREVIA}=${selo(chavePrevia())}; Path=/; Max-Age=${PREVIA_S}; HttpOnly; Secure; SameSite=Lax`

let neutraCache = null
/** A página neutra (sem marca, nome ou explicação do app). */
export function paginaNeutra() {
  neutraCache ??= readFileSync(new URL('../neutra.html', import.meta.url), 'utf8')
  return neutraCache
}

export function responderNeutra(res, status = 404) {
  res.statusCode = status
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Robots-Tag', 'noindex, nofollow')
  res.end(paginaNeutra())
}

/**
 * Para as rotas de api/: com a porta ligada e sem o cookie, responde a página neutra (404) e devolve true (a rota
 * para ali). Sem a porta (projeto oficial), não faz nada.
 */
export function fechadoPelaPrevia(req, res) {
  if (!previaLigada() || emPrevia(req)) return false
  responderNeutra(res, 404)
  return true
}
