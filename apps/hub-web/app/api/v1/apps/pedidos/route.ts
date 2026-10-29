import { authenticateAccessToken, authenticateAppClient } from '@zro/auth'
import { ESCOPO_DA_PONTE, pedidoEntreAppsDaPessoa, pedidoEntreAppsDoApp } from '@zro/core'
import { getDatabase } from '@zro/db'
import { DomainError } from '@zro/observability'
import { errorResponse, json, readJson } from '@/lib/api'

/**
 * POST /api/v1/apps/pedidos `{ destino, acao, sub? }`: a ponte entre apps da família (Maestro → SOBEDESCE, fase 7 do
 * Maestro v2). O HUB devolve um pedido assinado (`zro-pedido+jwt`, 60 s, `jti` de uso único) e o próprio app chama o
 * destino com ele; o HUB não repassa resposta nem byte. Só servidor a servidor, nunca pela sessão do navegador:
 * - `Authorization: Bearer <access token do app>` com o escopo de API do produto (Maestro: `maestro.projects`);
 * - `Authorization: Basic <client_id:client_secret>` + `sub`, só para desfazer (`drive.recolher_revisao`).
 * Regras em packages/core/src/pedidos-entre-apps.ts; contrato em docs/integration-contracts/maestro-sobedesce.md.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const db = getDatabase()
    const authorization = req.headers.get('authorization')
    const corpo = ((await readJson(req, 4_096)) ?? {}) as Record<string, unknown>
    if (authorization?.startsWith('Basic ')) {
      const client = await authenticateAppClient(db, authorization)
      if (!client) throw new DomainError('unauthenticated', 'Credencial do app inválida.')
      return json(await pedidoEntreAppsDoApp(db, client, corpo), 201)
    }
    if (!authorization?.startsWith('Bearer ')) throw new DomainError('unauthenticated', 'Só um app da família pede pela ponte (token do app).')
    // O escopo exigido é o da API do app de origem; tenta cada um (são poucos) e fica com o que valer.
    let auth = null
    for (const escopo of new Set(Object.values(ESCOPO_DA_PONTE))) {
      auth = await authenticateAccessToken(db, authorization, escopo)
      if (auth && ESCOPO_DA_PONTE[auth.session.app?.productId ?? ''] === escopo) break
      auth = null
    }
    if (!auth) throw new DomainError('unauthenticated', 'Token inválido, vencido ou sem permissão para esta ação.')
    return json(await pedidoEntreAppsDaPessoa(db, auth, corpo), 201)
  } catch (err) {
    return errorResponse(err)
  }
}
