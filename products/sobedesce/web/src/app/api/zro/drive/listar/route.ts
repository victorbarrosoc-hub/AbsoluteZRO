import { erro, json } from "@/lib/http";
import { ACAO_LISTAR, listarParaMaestro } from "@/lib/zro/drive-do-maestro";
import { atenderPedidoDoMaestro, idDoCorpo, respostaDoMaestro } from "@/lib/zro/maestro-rota";
import { textoDoCorpo } from "@/lib/zro/pedido-rota";

/**
 * POST /api/zro/drive/listar `{ pasta?, busca?, pagina?, conta? }`: o Maestro lista uma página de uma pasta do Drive
 * da pessoa (sem pasta: Meu Drive; com busca: por nome). Só metadados e o link curto da miniatura do Google. Pedido do
 * HUB (`zro_pedido` = drive.listar). Contrato: docs/integration-contracts/maestro-sobedesce.md (raiz do monorepo).
 */
export async function POST(req: Request): Promise<Response> {
  return atenderPedidoDoMaestro(req, ACAO_LISTAR, async (usuarioId, corpo) => {
    const raiz = corpo.pasta === undefined || corpo.pasta === null || corpo.pasta === "root";
    const pasta = raiz ? null : idDoCorpo(corpo.pasta);
    if (!raiz && !pasta) return { resposta: erro(400, "entrada", "Pasta inválida.") };
    const busca = corpo.busca === undefined ? null : textoDoCorpo(corpo.busca, 200);
    if (corpo.busca !== undefined && !busca) return { resposta: erro(400, "entrada", "Busca de 1 a 200 caracteres.") };
    const pagina = typeof corpo.pagina === "string" && corpo.pagina.length <= 2000 ? corpo.pagina : null;
    const conta = typeof corpo.conta === "string" && corpo.conta.length <= 64 ? corpo.conta : null;
    const r = await listarParaMaestro(usuarioId, { pasta, busca, pagina, conta });
    if (!r.ok) return { resposta: respostaDoMaestro(r), alvo: pasta };
    return { resposta: json({ conta: r.conta, pasta: r.pasta, itens: r.itens, proxima: r.proxima }), alvo: pasta };
  });
}
