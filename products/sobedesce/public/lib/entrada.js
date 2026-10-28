// Tela de entrada (decisão do titular, 28/10/2026): "a Z continua como aba, mas o app abre na tarefa quando há algo em
// andamento". Sem rota no endereço (abrir o app), entra na Z só se não houver tarefa em curso; com cartão na fila ou
// copiando, abre em Cartões; com transferência andando, em Transferências. Rota explícita (deep link, #/drive...) é
// respeitada sempre. Sem dependências: o teste roda no Node (test/entrada.test.js).

/** Estados de transferência que contam como "em andamento" (os mesmos de ACTIVE em store.js). */
export const EM_ANDAMENTO = new Set(['running', 'verifying', 'queued', 'waiting'])

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
 * A tela em que o app abre quando o endereço não diz qual: a tarefa em curso primeiro, senão a Z.
 * @param {{ transfers?: Map|Array, backup?: object|null }} estado
 * @returns {'cartoes'|'transferencias'|'z'}
 */
export function telaDeEntrada({ transfers, backup } = {}) {
  if (cartaoEmAndamento(backup)) return 'cartoes'
  if (transferenciaEmAndamento(transfers)) return 'transferencias'
  return 'z'
}
