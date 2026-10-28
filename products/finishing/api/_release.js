// Estado de lançamento da Revela (PRD §5 e §6; auditoria de acesso, Etapa B): fechada ao público por padrão, e o
// fechado vale mesmo com a Absolute ZRO fora do ar (deny-by-default). Abrir ao público pede os dois lados: o HUB (estado
// do produto em zro.product_release) e aqui (RELEASE=released no projeto Vercel, com deploy). A Vercel não transforma
// em função os arquivos de api/ que começam com "_": este é só o código comum.
//
// Quem pode usar a Revela enquanto fechada vem do HUB, na claim zro_release do id_token e do /oauth/userinfo:
//   { "finishing": "released" | "closed" | "allowed" }   allowed = fechado, mas esta conta está na lista do titular.
// A claim entra na sessão a cada login e a cada releitura do perfil (api/zro/eu.js); nunca vem de e-mail nem do cliente.
// Sessão antiga, sem a claim (login de antes do gate ou HUB sem o gate) = fechado.

export const PRODUTO = 'finishing'
/** Valores que a claim pode ter; qualquer outra coisa vale como ausente. */
export const ESTADOS = Object.freeze(['released', 'closed', 'allowed'])
export const HUB_INICIO = 'https://absolutezro.com/inicio'
/** A página "Em desenvolvimento" deste site (HTTP 200, sem dado interno; cleanUrls: sem .html). */
export const PAGINA_FECHADO = '/em-desenvolvimento'

/** O estado local: 'closed' (padrão) ou 'released' (RELEASE=released no ambiente). */
export const release = () => (String(process.env.RELEASE || '').trim() === 'released' ? 'released' : 'closed')
export const fechado = () => release() === 'closed'

/** O que o HUB disse sobre este produto para esta conta (claim zro_release), ou null quando não disse. */
export function estadoDaClaim(zroRelease) {
  const v = zroRelease && typeof zroRelease === 'object' ? zroRelease[PRODUTO] : undefined
  return typeof v === 'string' && ESTADOS.includes(v) ? v : null
}

/**
 * A sessão pode usar a Revela agora? Fechada (padrão): só a conta que o HUB marcou como `allowed`. Aberta
 * (RELEASE=released): todo mundo, menos quem o HUB marcou como `closed`. Sem sessão ou sem a claim: só quando aberta.
 */
export function liberado(sessao) {
  const estado = typeof sessao?.release === 'string' && ESTADOS.includes(sessao.release) ? sessao.release : null
  return fechado() ? estado === 'allowed' : estado !== 'closed'
}
