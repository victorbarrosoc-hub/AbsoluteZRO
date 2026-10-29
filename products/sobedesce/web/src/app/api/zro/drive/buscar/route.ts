import { erro, json } from "@/lib/http";
import { ACAO_BUSCA, buscarNoDrive, TERMO_MAX } from "@/lib/zro/drive-da-z";
import { atenderPedidoZro, respostaDaFalha, textoDoCorpo } from "@/lib/zro/pedido-rota";

/**
 * POST /api/zro/drive/buscar `{ termo }`: a Z (no HUB da Absolute ZRO) procura no Drive de uma pessoa, por nome ou
 * conteúdo. Só servidor a servidor, com o JWT curto do HUB (`zro_pedido` = drive.buscar). Só metadados.
 * Contrato em docs/integration-contracts/sobedesce-drive.md (raiz do monorepo).
 */
export async function POST(req: Request): Promise<Response> {
  return atenderPedidoZro(req, ACAO_BUSCA, async (usuarioId, corpo) => {
    const termo = textoDoCorpo(corpo.termo, TERMO_MAX);
    if (!termo) return erro(400, "termo_invalido", `Mande um termo de 1 a ${TERMO_MAX} caracteres.`);
    const r = await buscarNoDrive(usuarioId, termo);
    return r.ok ? json({ arquivos: r.arquivos, incompleta: r.incompleta }) : respostaDaFalha(r);
  });
}
