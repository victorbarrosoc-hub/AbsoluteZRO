import { erro, json } from "@/lib/http";
import { ACAO_RECOLHER, recolherDaRevisao } from "@/lib/zro/drive-do-maestro";
import { atenderPedidoDoMaestro, idDoCorpo, respostaDoMaestro } from "@/lib/zro/maestro-rota";

/**
 * POST /api/zro/drive/revisao/recolher `{ arquivoId, permissaoId }`: desliga o "qualquer pessoa com o link" que o
 * compartilhar criou (só uma permissão `anyone`; nunca outra). Idempotente. Desfazer vale mesmo sem o SOBEDESCE
 * liberado (o HUB também não exige o plano para esta ação).
 */
export async function POST(req: Request): Promise<Response> {
  return atenderPedidoDoMaestro(
    req,
    ACAO_RECOLHER,
    async (usuarioId, corpo) => {
      const id = idDoCorpo(corpo.arquivoId);
      const permissao = idDoCorpo(corpo.permissaoId);
      if (!id || !permissao) return { resposta: erro(400, "entrada", "Mande arquivoId e permissaoId.") };
      const r = await recolherDaRevisao(usuarioId, id, permissao);
      if (!r.ok) return { resposta: respostaDoMaestro(r), alvo: id };
      return { resposta: json({ recolhido: true, ja_nao_havia: r.ja_nao_havia }), alvo: id };
    },
    { exigirProduto: false },
  );
}
