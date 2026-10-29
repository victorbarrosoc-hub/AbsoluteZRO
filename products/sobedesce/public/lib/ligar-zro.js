// "Agora sua conta é Absolute ZRO" no app do computador (web/src/lib/zro/ligar.ts, decisão do titular de 29/10/2026).
// Conta antiga sem vínculo com a Absolute ZRO: o motor lê `zro.pedir` do /api/eu (src/google/cloud-auth.js). Com o app
// parado, a folha cobre a interface; com transferência ou cartão andando, só uma faixa fixa que não fecha — a fila e o
// motor seguem do mesmo jeito. Sem dependências além de entrada.js: o teste roda no Node (test/ligar-zro.test.js).
import { cartaoEmAndamento, transferenciaEmAndamento } from './entrada.js'

export const TITULO = 'Agora sua conta é Absolute ZRO'
export const BOTAO = 'Continuar com Absolute ZRO'

/**
 * 'folha' (cobre a interface), 'faixa' (algo andando: a interface continua) ou null (nada a pedir).
 * @param {{ conectado?: boolean, zro?: { pedir?: boolean } | null } | null} cloud
 * @param {{ transfers?: Map|Array, backup?: object|null }} tarefas
 */
export function modoLigarZro(cloud, { transfers, backup } = {}) {
  if (!cloud?.conectado || !cloud.zro?.pedir) return null
  return transferenciaEmAndamento(transfers) || cartaoEmAndamento(backup) ? 'faixa' : 'folha'
}
