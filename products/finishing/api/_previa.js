// A porta de prévia da Revela (decisão do titular, 09/11/2026): para abrir num projeto Vercel à parte (team grátis
// ZROFREE), sem o login do HUB (o login único só volta para revela.absolutezro.com) e sem chave ou banco de produção.
// Quem abre /previa?chave=<ZRO_CHAVE_PREVIA> uma vez ganha o cookie rv_previa (o HMAC-SHA256 da chave, nunca a chave,
// 30 dias) e usa as ferramentas como a conta `allowed`. Sem a variável (o projeto oficial no Pro não a define) ou com
// menos de 24 caracteres, a porta não existe e nada muda. A mesma semântica do CAMZRO (products/camzro/api/_sessao.js).
// A Vercel não transforma em função os arquivos de api/ que começam com "_".

import { createHmac, timingSafeEqual } from 'node:crypto'
import { lerCookie } from './_zro.js'

export const COOKIE_PREVIA = 'rv_previa'
export const PREVIA_S = 30 * 24 * 3600
/** Para onde a porta leva depois da chave certa: a primeira ferramenta (o / fechado é a página neutra). */
export const DESTINO_PREVIA = '/inicio'

/** A chave da prévia, se estiver configurada e for comprida o bastante (24+ caracteres); senão null. */
export function chavePrevia() {
  const k = String(process.env.ZRO_CHAVE_PREVIA || '').trim()
  return k.length >= 24 ? k : null
}

/** O valor do cookie: HMAC da chave (o cookie nunca carrega a chave). */
export const selo = (chave) => createHmac('sha256', chave).update('revela:previa:v1').digest('base64url')

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

/** O pedido vem com o cookie da prévia válido (e a porta existe)? */
export function emPrevia(req) {
  const k = chavePrevia()
  if (!k) return false
  const v = lerCookie(req, COOKIE_PREVIA)
  return Boolean(v && v.length < 100 && iguais(v, selo(k)))
}
