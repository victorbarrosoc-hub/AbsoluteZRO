import { erro, json } from "@/lib/http";
import { ACAO_PASTA, listarPasta, ORDENS, TERMO_MAX, type Ordem } from "@/lib/zro/drive-da-z";
import { atenderPedidoZro, respostaDaFalha, textoDoCorpo } from "@/lib/zro/pedido-rota";

/**
 * POST /api/zro/drive/pasta `{ pasta, ordem? }`: a Z lista o conteúdo de uma pasta do Drive da pessoa, achada pelo
 * id ou pelo nome. `ordem`: mais_antigo (quando entrou no Drive, o padrão), mais_recente ou nome. Nome em várias
 * pastas devolve `{ escolher: [...] }`; nenhuma, `{ nao_achou: true }`. Só servidor a servidor (`zro_pedido` =
 * drive.pasta). Contrato em docs/integration-contracts/sobedesce-drive.md (raiz do monorepo).
 */
export async function POST(req: Request): Promise<Response> {
  return atenderPedidoZro(req, ACAO_PASTA, async (usuarioId, corpo) => {
    const pasta = textoDoCorpo(corpo.pasta, TERMO_MAX);
    if (!pasta) return erro(400, "pasta_invalida", `Mande o nome ou o id da pasta (1 a ${TERMO_MAX} caracteres).`);
    const ordem = corpo.ordem ?? "mais_antigo";
    if (typeof ordem !== "string" || !Object.hasOwn(ORDENS, ordem)) return erro(400, "ordem_invalida", "Ordem: mais_antigo, mais_recente ou nome.");
    const r = await listarPasta(usuarioId, pasta, ordem as Ordem);
    if (!r.ok) return respostaDaFalha(r);
    if (r.tipo === "nao_achou") return json({ nao_achou: true });
    if (r.tipo === "escolher") return json({ escolher: r.pastas });
    return json({ pasta: r.pasta, ordem: r.ordem, arquivos: r.arquivos, mais: r.mais });
  });
}
