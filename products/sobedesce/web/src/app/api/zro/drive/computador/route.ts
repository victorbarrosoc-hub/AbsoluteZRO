import { erro, json } from "@/lib/http";
import { ehFormato } from "@/lib/referencias/formatos";
import { ACAO_COMPUTADOR, pedirAoComputador } from "@/lib/zro/computador-da-z";
import { atenderPedidoZro, respostaDaFalha } from "@/lib/zro/pedido-rota";

/**
 * POST /api/zro/drive/computador `{ arquivoId, formato }`: cria o pedido "Baixar como…" (o mesmo do celular,
 * pedidos_proxy tipo "formato") para o computador da pessoa converter e salvar ao lado do original. Pedido do HUB
 * (`zro_pedido` = drive.computador), que só assina depois do "sim" da pessoa. Repetido: devolve o que já espera.
 */
export async function POST(req: Request): Promise<Response> {
  return atenderPedidoZro(req, ACAO_COMPUTADOR, async (usuarioId, corpo) => {
    if (typeof corpo.arquivoId !== "string" || !ehFormato(corpo.formato)) return erro(400, "entrada", "Mande arquivoId e um formato (mp4, mp4-1080, mp4-720, mp3-320, wav, m4a, jpg).");
    const r = await pedirAoComputador(usuarioId, corpo.arquivoId, corpo.formato);
    if (r.ok) return json(r, r.pedido.novo ? 201 : 200);
    if (!("mensagem" in r)) return respostaDaFalha(r);
    const status = { nao_achou: 404, formato_incompativel: 400, sem_computador: 409 }[r.erro];
    return erro(status, r.erro, r.mensagem);
  });
}
