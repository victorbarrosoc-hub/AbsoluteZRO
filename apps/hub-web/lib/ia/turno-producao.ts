import 'server-only'
import { concluirTurno, registrarUsoDoTurno, type IaUso, type Turno } from '@zro/core'
import type { Database } from '@zro/db'
import { createLogger } from '@zro/observability'
import { responder, type IaEvento, type RespostaOpcoes } from './modelo'

const log = createLogger('ia')

export type EventoDoTurno = IaEvento | { tipo: 'fim'; mensagem: string; creditos: number } | { tipo: 'erro'; mensagem: string }
export type Responder = (
  db: Database,
  turno: Turno,
  emitir: (e: IaEvento) => void,
  signal?: AbortSignal,
  opcoes?: RespostaOpcoes,
) => Promise<{ texto: string; uso: IaUso }>

/**
 * Um turno do chat de produção: responde, guarda a resposta, gasta o crédito e registra o custo (z_lab_uso). O uso é
 * acumulado fora do try: se o stream abortar ou der erro depois de gastar tokens, o gasto é gravado no finally
 * (idempotente pela pergunta, então o caminho feliz não duplica). Registrar nunca derruba a resposta.
 * `resp` só existe para os testes trocarem o Claude.
 */
export async function executarTurno(db: Database, turno: Turno, enviar: (e: EventoDoTurno) => void, signal?: AbortSignal, resp: Responder = responder) {
  const uso: IaUso = { modelo: '', entrada: 0, saida: 0, cache: 0 }
  let concluido = false
  try {
    const r = await resp(db, turno, enviar, signal, { uso })
    const fim = await concluirTurno(db, turno, r.texto, r.uso)
    concluido = true
    enviar({ tipo: 'fim', mensagem: fim.mensagemId, creditos: fim.creditos })
  } catch (err) {
    log.error('ia.resposta', { error: err })
    enviar({ tipo: 'erro', mensagem: 'A Z não conseguiu responder agora. Tente de novo em instantes.' })
  } finally {
    if (!concluido) await registrarUsoDoTurno(db, turno, uso)
  }
}
