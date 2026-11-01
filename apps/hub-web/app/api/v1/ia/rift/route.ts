import { randomBytes } from 'node:crypto'
import { authenticateAppClient } from '@zro/auth'
import { pedidoDaZNoRift } from '@zro/core'
import { getDatabase } from '@zro/db'
import { createLogger, DomainError } from '@zro/observability'
import { errorResponse, json, readJson } from '@/lib/api'
import { iaLigada } from '@/lib/ia/modelo'
import { responderNoRift } from '@/lib/ia/rift'

export const maxDuration = 90
const log = createLogger('ia.rift')

/**
 * POST /api/v1/ia/rift `{ sub, pedido, cena }`: a Z dentro do Rift Motion, com a chave do HUB. Só servidor a servidor:
 * `Authorization: Basic <client_id:client_secret>` do cliente confidencial `rift-web`. Regras (lista de liberados,
 * conta ativa que já entrou no Rift, teto do dia) em packages/core/src/z-rift.ts. Devolve `{ resposta, acoes }`.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const db = getDatabase()
    const client = await authenticateAppClient(db, req.headers.get('authorization'))
    if (!client) throw new DomainError('unauthenticated', 'Credencial do app inválida.')
    if (!iaLigada()) throw new DomainError('upstream_unavailable', 'A Z ainda não foi ligada.')
    const pedido = await pedidoDaZNoRift(db, client, await readJson(req, 80_000))
    const id = randomBytes(9).toString('hex')
    try {
      return json(await responderNoRift(db, pedido, id))
    } catch (err) {
      if (err instanceof DomainError) throw err
      log.error('ia.rift.resposta', { error: err })
      throw new DomainError('upstream_unavailable', 'A Z não respondeu agora. Tente de novo em instantes.')
    }
  } catch (err) {
    return errorResponse(err)
  }
}
