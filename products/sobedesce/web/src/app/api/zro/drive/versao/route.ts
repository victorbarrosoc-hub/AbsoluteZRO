import { erro, json } from "@/lib/http";
import { ehFormato } from "@/lib/referencias/formatos";
import { ACAO_VERSAO, procurarVersao } from "@/lib/zro/computador-da-z";
import { atenderPedidoZro, respostaDaFalha } from "@/lib/zro/pedido-rota";

/**
 * POST /api/zro/drive/versao `{ arquivoId, formato }`: só lê. A versão pedida (ex.: mp4-720) já existe no Drive da
 * pessoa? Devolve o original, as versões achadas (o próprio arquivo, a pasta dele e os de nome parecido), se o
 * computador converte esse tipo e como estão os computadores da conta. Pedido do HUB (`zro_pedido` = drive.versao).
 */
export async function POST(req: Request): Promise<Response> {
  return atenderPedidoZro(req, ACAO_VERSAO, async (usuarioId, corpo) => {
    if (typeof corpo.arquivoId !== "string" || !ehFormato(corpo.formato)) return erro(400, "entrada", "Mande arquivoId e um formato (mp4, mp4-1080, mp4-720, mp3-320, wav, m4a, jpg).");
    const r = await procurarVersao(usuarioId, corpo.arquivoId, corpo.formato);
    if (!r.ok) return respostaDaFalha(r);
    if ("nao_achou" in r) return erro(404, "nao_achou", "Arquivo não encontrado no Drive.");
    return json(r);
  });
}
