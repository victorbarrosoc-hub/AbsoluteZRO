// "Agora sua conta é Absolute ZRO" no app do celular (web/src/lib/zro/ligar.ts, decisão do titular de 29/10/2026).
// Conta antiga sem vínculo com a Absolute ZRO: o /api/eu manda `zro.pedir`. O app mostra a tela inteira no lugar das
// abas; com envio andando (fila do celular ou Wi-Fi), mostra só uma faixa fixa em cima e a fila segue embaixo. Nada
// aqui para envio, token ou conta: é só a tela. Sem dependências: o teste roda no Node (test/ligar-zro.test.js).

export const TITULO = 'Agora sua conta é Absolute ZRO'
export const BOTAO = 'Continuar com Absolute ZRO'
/** O vincular de sempre; um erro volta para /app/?erro=<codigo>. */
export const LIGAR = '/api/zro/entrar?modo=vincular&volta=%2Fapp%2F'
/** "Usar outra conta": o mesmo vincular, pedindo à Absolute ZRO a conta de novo (prompt=login). */
export const OUTRA = LIGAR + '&trocar=1'
export const LINK_OUTRA = 'Usar outra conta'
/**
 * "Entrar nessa conta" (web/src/lib/zro/outra-conta.ts): POST sem corpo; o servidor só troca a sessão com o selo que
 * guardou no callback (o app não manda conta nenhuma). O CSP do app não deixa formulário: vai por fetch.
 */
export const TROCAR = '/api/zro/trocar-conta'
export const BOTAO_TROCAR = 'Entrar nessa conta'

/** Estados da fila que contam como "andando" (pausado não segura a tela: a pessoa retoma depois). */
export const ANDANDO = new Set(['queued', 'preparing', 'running', 'mac'])

/** O que veio no /api/eu. Servidor antigo (sem o campo) → null: nada aparece. */
export function lerZro(raw) {
  if (!raw || typeof raw !== 'object') return null
  return { ligada: raw.ligada === true, pedir: raw.pedir === true }
}

const LOGADO = new Set(['signedIn', 'noDrive', 'choose', 'reconnect'])

/**
 * 'tela' (tela inteira), 'faixa' (envio andando: só a faixa, a fila continua) ou null.
 * @param {{ auth?: { status: string }, zro?: { pedir: boolean } | null }} state
 * @param {boolean} ocupado algum envio andando no celular (fila ou Wi-Fi)
 */
export function modoLigar(state, ocupado) {
  if (!state?.zro?.pedir || !LOGADO.has(state.auth?.status)) return null
  return ocupado ? 'faixa' : 'tela'
}

export function filaAndando(items) {
  for (const it of items || []) if (it && ANDANDO.has(it.status)) return true
  return false
}

const RECADOS = {
  zro_outra_conta: 'Esta conta Absolute ZRO já está ligada a outra conta SOBEDESCE.',
  zro_email_nao_verificado: 'Falta confirmar seu e-mail na Absolute ZRO. Confirme pelo link que chegou e tente de novo.',
  zro_ja_ligada: 'Esta conta SOBEDESCE já está ligada a outra conta Absolute ZRO.',
  zro_recusado: 'Tudo bem, nada foi conectado.',
  zro_expirou: 'Demorou demais. Tente de novo.',
  zro_erro: 'A Absolute ZRO não completou agora. Tente de novo em instantes.',
  zro_config: 'A Absolute ZRO ainda não foi configurada neste servidor.',
}

/** Recado do ?erro= da volta (só os da Absolute ZRO), ou null. */
export function recadoDe(codigo) {
  return (codigo && RECADOS[codigo]) || null
}
