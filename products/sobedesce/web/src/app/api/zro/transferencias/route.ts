import { json } from "@/lib/http";
import { atenderPedidoZro } from "@/lib/zro/pedido-rota";
import { ACAO_TRANSFERENCIAS, transferenciasParaZ } from "@/lib/zro/transferencias-da-z";

/**
 * POST /api/zro/transferencias `{}`: a Z (no HUB da Absolute ZRO) lê como estão as transferências da pessoa, pelo
 * último retrato de cada computador (o mesmo do celular). Só servidor a servidor, com o JWT curto do HUB
 * (`zro_pedido` = transferencias.ler). Só leitura; sem caminho local nem token.
 * Contrato em docs/integration-contracts/sobedesce-drive.md (raiz do monorepo).
 */
export async function POST(req: Request): Promise<Response> {
  return atenderPedidoZro(req, ACAO_TRANSFERENCIAS, async (usuarioId) => json(await transferenciasParaZ(usuarioId)));
}
