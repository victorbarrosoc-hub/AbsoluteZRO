// Prévia do titular no team grátis ZROFREE (decisão do titular, 09/11/2026: "Sim, em todos"). O AEON segue fechado ao
// público; esta é uma porta a mais, que só existe quando o projeto Vercel define ZRO_CHAVE_PREVIA (24+ caracteres; o
// projeto oficial no Pro não define). Quem abre /previa?chave=<a chave> uma vez ganha o cookie ae_previa — o
// HMAC-SHA256 da chave, nunca a chave — por 30 dias, e usa o editor como a conta `allowed`, sem login: "só a
// interface". O que depende da conta Absolute ZRO (IA, Higgsfield, sons, Set) continua pedindo a conta.
// A Vercel não transforma em função os arquivos de api/ que começam com "_": este é só o código comum.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { lerCookie } from './_zro.js'

export const COOKIE_PREVIA = 'ae_previa'
export const PREVIA_S = 30 * 24 * 3600
/** Onde a prévia abre: o editor. */
export const DESTINO_PREVIA = '/app/'

/** A chave, se configurada e comprida o bastante (24+ caracteres); senão null (a porta não existe). */
export function chavePrevia() {
  const k = String(process.env.ZRO_CHAVE_PREVIA || '').trim()
  return k.length >= 24 ? k : null
}

/** O valor do cookie: HMAC da chave (o cookie nunca carrega a chave). */
export const selo = (chave) => createHmac('sha256', chave).update('ai-edit:previa:v1').digest('base64url')

const iguais = (a, b) => {
  const x = Buffer.from(String(a))
  const y = Buffer.from(String(b))
  return x.length === y.length && timingSafeEqual(x, y)
}

/** A chave digitada confere com a configurada (tempo constante). */
export function chaveConfere(digitada) {
  const k = chavePrevia()
  return Boolean(k && typeof digitada === 'string' && digitada.length <= 256 && iguais(digitada, k))
}

/** O pedido traz o cookie da prévia válido para a chave de agora (trocar a chave derruba os cookies antigos). */
export function emPrevia(req) {
  const k = chavePrevia()
  if (!k) return false
  const v = lerCookie(req, COOKIE_PREVIA)
  return Boolean(v && v.length < 100 && iguais(v, selo(k)))
}
