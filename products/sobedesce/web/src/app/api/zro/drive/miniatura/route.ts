import { erro, json } from "@/lib/http";
import { ACAO_MINIATURA, miniaturaParaMaestro } from "@/lib/zro/drive-do-maestro";
import { atenderPedidoDoMaestro, idDoCorpo, respostaDoMaestro } from "@/lib/zro/maestro-rota";

/**
 * POST /api/zro/drive/miniatura `{ arquivoId, px? }`: o link curto da miniatura do Google para o `<img>` do Maestro
 * (o navegador busca no Google; nenhum byte passa por aqui). Pedido do HUB (`zro_pedido` = drive.miniatura).
 */
export async function POST(req: Request): Promise<Response> {
  return atenderPedidoDoMaestro(req, ACAO_MINIATURA, async (usuarioId, corpo) => {
    const id = idDoCorpo(corpo.arquivoId);
    if (!id) return { resposta: erro(400, "entrada", "Mande o arquivoId.") };
    const px = typeof corpo.px === "number" && Number.isInteger(corpo.px) && corpo.px >= 64 && corpo.px <= 1600 ? corpo.px : undefined;
    const r = await miniaturaParaMaestro(usuarioId, id, px);
    return { resposta: r.ok ? json({ url: r.url, expira_em: r.expira_em }) : respostaDoMaestro(r), alvo: id };
  });
}
