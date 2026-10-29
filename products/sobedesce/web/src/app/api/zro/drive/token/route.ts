import { json } from "@/lib/http";
import { ACAO_TOKEN, tokenParaMaestro } from "@/lib/zro/drive-do-maestro";
import { atenderPedidoDoMaestro, respostaDoMaestro } from "@/lib/zro/maestro-rota";

/**
 * POST /api/zro/drive/token `{ conta? }`: o access token curto (minutos) de uma conta Google da própria pessoa, para o
 * Maestro navegar e tocar o Drive direto do navegador (decisão do titular, 28/10/2026). Nunca o refresh token; o
 * Maestro não guarda (só a memória da aba). Limite próprio e auditado. Pedido do HUB (`zro_pedido` = drive.token).
 */
export async function POST(req: Request): Promise<Response> {
  return atenderPedidoDoMaestro(
    req,
    ACAO_TOKEN,
    async (usuarioId, corpo) => {
      const conta = typeof corpo.conta === "string" && corpo.conta.length <= 64 ? corpo.conta : null;
      const r = await tokenParaMaestro(usuarioId, conta);
      if (!r.ok) return { resposta: respostaDoMaestro(r), alvo: conta };
      return { resposta: json({ access_token: r.access_token, expira_em: r.expira_em, conta: r.conta, contas: r.contas }), alvo: r.conta.id };
    },
    { token: true },
  );
}
