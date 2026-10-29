import { erro, json } from "@/lib/http";
import { ACAO_PASTA_CRIAR, criarEstruturaDoProjeto, nomeDePasta } from "@/lib/zro/drive-do-maestro";
import { atenderPedidoDoMaestro, idDoCorpo, respostaDoMaestro } from "@/lib/zro/maestro-rota";

/**
 * POST /api/zro/drive/pasta/criar `{ cliente, projeto, raiz?, conta? }`: a estrutura padrão do projeto no Drive da
 * pessoa, `Maestro/<Cliente>/<Projeto>/{01 Briefing, 02 Bruto, 03 Edição, 04 Revisão, 05 Entregas}`. Idempotente: acha
 * antes de criar, nunca renomeia nem apaga. Pedido do HUB (`zro_pedido` = drive.pasta.criar).
 */
export async function POST(req: Request): Promise<Response> {
  return atenderPedidoDoMaestro(req, ACAO_PASTA_CRIAR, async (usuarioId, corpo) => {
    const cliente = nomeDePasta(corpo.cliente);
    const projeto = nomeDePasta(corpo.projeto);
    if (!cliente || !projeto) return { resposta: erro(400, "entrada", "Mande o nome do cliente e do projeto.") };
    const raiz = corpo.raiz === undefined || corpo.raiz === null ? null : idDoCorpo(corpo.raiz);
    if (corpo.raiz && !raiz) return { resposta: erro(400, "entrada", "Pasta de origem inválida.") };
    const conta = typeof corpo.conta === "string" && corpo.conta.length <= 64 ? corpo.conta : null;
    const r = await criarEstruturaDoProjeto(usuarioId, { cliente, projeto, raiz, conta });
    if (!r.ok) return { resposta: respostaDoMaestro(r), alvo: raiz };
    return { resposta: json({ pasta: r.pasta, subpastas: r.subpastas, criadas: r.criadas }, r.criadas ? 201 : 200), alvo: r.pasta.id };
  });
}
