// Quem está usando o CAMZRO. Três portas, e só elas:
//
// 1. Conta Absolute ZRO (login único, cookie cz_conta) com `camzro` na claim zro_release (gate de lançamento, raiz
//    CLAUDE.md): o caminho de produção. Libera também o ecossistema (Set, relógio do set, Maestro).
// 2. Prévia do titular (CAMZRO_CHAVE_PREVIA): para testar num projeto Vercel à parte, antes do login estar ligado. Quem
//    abre /previa?chave=<a chave> uma vez ganha o cookie cz_previa (HMAC da chave, 30 dias) e vê o app. Sem a chave,
//    a página neutra. Sem a variável, a porta não existe.
// 3. Modo local (CAMZRO_LOCAL=1, sem login configurado, pedido de localhost): só para desenvolver e para os testes.
//
// A câmera roda inteira no aparelho; nenhuma porta manda imagem ou som para o servidor.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { abrir, configurado, COOKIE_CONTA, lerCookie, temAcesso } from './_zro.js'

export const COOKIE_PREVIA = 'cz_previa'
export const PREVIA_S = 30 * 24 * 3600

const hostLocal = (req) => /^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(String(req.headers.host || '').toLowerCase())

export const modoLocal = (req) => !configurado() && process.env.CAMZRO_LOCAL === '1' && hostLocal(req)

/** A chave da prévia, se estiver configurada e for comprida o bastante (24+ caracteres). */
export function chavePrevia() {
  const k = String(process.env.CAMZRO_CHAVE_PREVIA || '').trim()
  return k.length >= 24 ? k : null
}

/** O valor do cookie da prévia: HMAC da chave (o cookie nunca carrega a chave). */
export const selo = (chave) => createHmac('sha256', chave).update('camzro:previa:v1').digest('base64url')

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

export function emPrevia(req) {
  const k = chavePrevia()
  if (!k) return false
  const v = lerCookie(req, COOKIE_PREVIA)
  return Boolean(v && v.length < 100 && iguais(v, selo(k)))
}

/**
 * Quem é, já passado pelo gate, ou null. { tipo: 'conta'|'previa'|'local', sub, nome, foto, org }.
 * Só o tipo 'conta' fala com o ecossistema.
 */
export function pessoaDe(req) {
  const c = abrir(COOKIE_CONTA, lerCookie(req, COOKIE_CONTA))
  if (c && typeof c.sub === 'string' && temAcesso(c.apps)) {
    const foto = (typeof c.foto === 'string' && /\/api\/v1\/foto\/([A-Za-z0-9_-]{8,80})$/.exec(c.foto)?.[1]) || null
    const nome = String(c.nome || String(c.email || '').split('@')[0] || 'Pessoa').slice(0, 60)
    return { tipo: 'conta', sub: c.sub, nome, foto, org: c.org?.id || null }
  }
  if (emPrevia(req)) return { tipo: 'previa', sub: null, nome: 'Prévia', foto: null, org: null }
  if (modoLocal(req)) return { tipo: 'local', sub: null, nome: 'Local', foto: null, org: null }
  return null
}
