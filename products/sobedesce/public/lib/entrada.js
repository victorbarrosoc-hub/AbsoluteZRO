// Tela de entrada (decisão do titular, 29/10/2026; Plano de Integração §7–8: "a tarefa principal do aplicativo vem
// primeiro"). Sem rota no endereço (abrir o app), entra na tarefa: com cartão na fila ou copiando, em Cartões; com
// transferência andando, em Transferências; senão no Início. A Z nunca é a entrada nem abre sozinha: fica num item
// discreto no pé da barra lateral (#/z). Rota explícita (deep link, #/drive..., #/z) é respeitada sempre.
// Sem dependências: o teste roda no Node (test/entrada.test.js).

/** Estados de transferência que contam como "em andamento" (os mesmos de ACTIVE em store.js). */
export const EM_ANDAMENTO = new Set(['running', 'verifying', 'queued', 'waiting'])

/** A tela de quem abre o app sem tarefa em curso: o Início (nunca a Z). */
export const INICIO = 'painel'

/** Há cartão sendo copiado, na fila ou esperando a pessoa dizer de quem é? */
export function cartaoEmAndamento(backup) {
  if (!backup) return false
  return Boolean(backup.job) || (backup.fila?.length ?? 0) > 0 || (backup.pedidos?.length ?? 0) > 0
}

/** Alguma transferência andando? `transfers`: Map ou lista de { status }. */
export function transferenciaEmAndamento(transfers) {
  for (const t of transfers?.values?.() ?? transfers ?? []) if (t && EM_ANDAMENTO.has(t.status)) return true
  return false
}

/**
 * A tela em que o app abre quando o endereço não diz qual: a tarefa em curso primeiro, senão o Início.
 * @param {{ transfers?: Map|Array, backup?: object|null }} estado
 * @returns {'cartoes'|'transferencias'|'painel'}
 */
export function telaDeEntrada({ transfers, backup } = {}) {
  if (cartaoEmAndamento(backup)) return 'cartoes'
  if (transferenciaEmAndamento(transfers)) return 'transferencias'
  return INICIO
}
