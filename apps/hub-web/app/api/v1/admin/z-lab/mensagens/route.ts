import { adminDoLab, conferirTeto, custoClaudeUsd, lerPedidoDoLab, registrarUso } from '@zro/core'
import { createLogger, DomainError } from '@zro/observability'
import { readJson, route } from '@/lib/api'
import { configDoTeste, FALADA, mensagensDoLab, opcoesDoTeste, turnoDoLab } from '@/lib/ia/lab/turno'
import { iaLigada, responder, type IaEvento } from '@/lib/ia/modelo'

export const maxDuration = 120
const log = createLogger('z-lab')

/**
 * Um turno do Laboratório da Z, em streaming (NDJSON, os mesmos eventos da Z: `lendo`, `texto`) e, no fim, `fim` com o
 * uso e o custo estimado, ou `erro`. Antes de gastar: admin da plataforma, chave ligada e teto do dia.
 */
export const POST = route(
  async ({ db, auth, req }) => {
    adminDoLab(auth)
    if (!iaLigada()) throw new DomainError('upstream_unavailable', 'Conecte a chave do Claude (IA_ANTHROPIC_KEY).')
    const pedido = lerPedidoDoLab(await readJson(req, 4_000_000))
    const admin = await conferirTeto(db, auth)
    const { config, personalizacao } = await configDoTeste(db, auth, pedido)
    const turno = await turnoDoLab(db, auth, pedido)
    const opcoes = opcoesDoTeste(pedido, config)
    const enc = new TextEncoder()
    const corpo = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        const enviar = (e: IaEvento | Record<string, unknown>) => ctrl.enqueue(enc.encode(JSON.stringify(e) + '\n'))
        try {
          const { texto, uso } = await responder(db, turno, enviar, req.signal, {
            ...opcoes,
            personalizacao,
            mensagens: mensagensDoLab(pedido.historico),
            instrucao: pedido.voz ? FALADA : undefined,
          })
          const custoUsd = custoClaudeUsd(uso.modelo, uso)
          await registrarUso(db, admin, {
            servico: 'claude',
            modelo: uso.modelo,
            tokensEntrada: uso.entrada,
            tokensSaida: uso.saida,
            tokensCache: uso.cache,
            custoUsd,
            chave: `claude:${turno.perguntaId}`,
          })
          enviar({ tipo: 'fim', texto: !!texto, uso: { ...uso, custoUsd } })
        } catch (err) {
          log.error('z_lab.resposta', { error: err })
          enviar({ tipo: 'erro', mensagem: 'A Z não conseguiu responder agora. Tente de novo em instantes.' })
        } finally {
          ctrl.close()
        }
      },
    })
    return new Response(corpo, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } })
  },
  { mutation: true },
)
