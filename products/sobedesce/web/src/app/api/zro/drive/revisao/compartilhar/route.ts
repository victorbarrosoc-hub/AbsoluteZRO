import { erro, json } from "@/lib/http";
import { ACAO_COMPARTILHAR, compartilharParaRevisao } from "@/lib/zro/drive-do-maestro";
import { atenderPedidoDoMaestro, idDoCorpo, respostaDoMaestro } from "@/lib/zro/maestro-rota";

/**
 * POST /api/zro/drive/revisao/compartilhar `{ arquivoId }`: liga "qualquer pessoa com o link" (leitor, sem aparecer em
 * busca) no arquivo da versão enquanto o link do cliente no Maestro vale (decisão do titular, 28/10/2026). Já público:
 * nada muda (`ja_publico`). Devolve o id da permissão criada, para o Maestro recolher depois.
 */
export async function POST(req: Request): Promise<Response> {
  return atenderPedidoDoMaestro(req, ACAO_COMPARTILHAR, async (usuarioId, corpo) => {
    const id = idDoCorpo(corpo.arquivoId);
    if (!id) return { resposta: erro(400, "entrada", "Mande o arquivoId.") };
    const r = await compartilharParaRevisao(usuarioId, id);
    if (!r.ok) return { resposta: respostaDoMaestro(r), alvo: id };
    return { resposta: json({ arquivoId: r.arquivoId, permissao_id: r.permissao_id, ja_publico: r.ja_publico, resource_key: r.resource_key }), alvo: id };
  });
}
