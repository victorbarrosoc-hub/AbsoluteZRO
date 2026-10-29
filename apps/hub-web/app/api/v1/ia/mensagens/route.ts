import { concluirTurno, iniciarTurno } from '@zro/core'
import { DomainError } from '@zro/observability'
import { createLogger } from '@zro/observability'
import { readJson, route } from '@/lib/api'
import { comCors, IA_ESCOPO, preflight } from '@/lib/ia/http'
import { iaLigada, responder, type IaEvento } from '@/lib/ia/modelo'

export const maxDuration = 120
const log = createLogger('ia')

/**
 * Uma pergunta à IA do ecossistema. A resposta vem em streaming, uma linha JSON por evento (application/x-ndjson):
 * `conversa` (id e título), `lendo` (a IA está consultando um projeto), `texto` (pedaço da resposta), e no fim
 * `fim` (id da mensagem e créditos gastos) ou `erro`. Sem crédito, sem plano ou sem IA ligada, a resposta é um erro
 * JSON comum, antes de qualquer gasto.
 */
const post = route(
  async ({ db, auth, req }) => {
    if (!iaLigada()) throw new DomainError('upstream_unavailable', 'A Z, a IA da Absolute ZRO, ainda não foi ligada.')
    const turno = await iniciarTurno(db, auth, await readJson(req, 64_000))
    const enc = new TextEncoder()
    const corpo = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        const enviar = (e: IaEvento | { tipo: 'fim'; mensagem: string; creditos: number } | { tipo: 'erro'; mensagem: string }) =>
          ctrl.enqueue(enc.encode(JSON.stringify(e) + '\n'))
        enviar({ tipo: 'conversa', id: turno.conversa.id, titulo: turno.conversa.titulo })
        try {
          const { texto, uso } = await responder(db, turno, enviar, req.signal)
          const r = await concluirTurno(db, turno, texto, uso)
          enviar({ tipo: 'fim', mensagem: r.mensagemId, creditos: r.creditos })
        } catch (err) {
          log.error('ia.resposta', { error: err })
          enviar({ tipo: 'erro', mensagem: 'A Z não conseguiu responder agora. Tente de novo em instantes.' })
        } finally {
          ctrl.close()
        }
      },
    })
    return new Response(corpo, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } })
  },
  { bearer: IA_ESCOPO, mutation: true },
)

export const POST = async (req: Request, ctx: { params: Promise<Record<string, string>> }) => comCors(req, await post(req, ctx))
export const OPTIONS = preflight
