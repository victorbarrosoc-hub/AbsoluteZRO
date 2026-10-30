import { ESCOPO_RECEBER_ENTREGA, entregasRecebidas, marcarRecebidas } from '@zro/integrations'
import { readJson, route } from '@/lib/api'

/**
 * A caixa de entrada do TPeasy (Criação F8; docs/integration-contracts/maestro-tpeasy.md). Só o próprio app de destino,
 * com o access token da pessoa (`tpeasy.roteiros`, migração 0040); cada um lê só o que chegou para si (RLS).
 * - GET `?destino=tpeasy&desde=<iso>`: o que chegou nos últimos 30 dias (a partir de `desde`, se vier), mais antigo
 *   primeiro, até 50. `agora` é o próximo `desde`.
 * - POST `{ ids }`: o aparelho conta o que gravou (quem mandou vê "Recebido").
 */
export const GET = route(
  async ({ db, auth, req }) => {
    const q = new URL(req.url).searchParams
    return entregasRecebidas(db, auth, { destino: q.get('destino') ?? undefined, desde: q.get('desde') ?? undefined })
  },
  { bearer: ESCOPO_RECEBER_ENTREGA.tpeasy },
)

export const POST = route(async ({ db, auth, req }) => marcarRecebidas(db, auth, await readJson(req, 10_000)), {
  bearer: ESCOPO_RECEBER_ENTREGA.tpeasy,
  mutation: true,
})
