import { REGRAS } from "@/lib/auth/limite";
import { erro, json } from "@/lib/http";
import { atenderPedidoDoMaestro } from "@/lib/zro/maestro-rota";
import { ACAO_RELAY_CANCELAR, cancelarVersao } from "@/lib/zro/relay";

const ID = /^[A-Za-z0-9_.:-]{1,120}$/;

/**
 * POST /api/zro/relay/cancelar `{ id }`: pendente ou convertendo vira cancelado (`{ cancelado: true }`); já terminado
 * (pronto, erro ou cancelado) não muda (`{ cancelado: false, ja_terminado: true }`). O que o computador já subiu fica
 * no Drive: o SOBEDESCE nunca apaga mídia.
 */
export async function POST(req: Request): Promise<Response> {
  return atenderPedidoDoMaestro(
    req,
    ACAO_RELAY_CANCELAR,
    async (usuarioId, corpo) => {
      if (Object.keys(corpo).some((k) => k !== "id") || typeof corpo.id !== "string" || !ID.test(corpo.id)) return { resposta: erro(400, "entrada", "Mande o id do pedido.") };
      const r = await cancelarVersao(usuarioId, corpo.id);
      if (!r.ok) return { resposta: erro(404, "nao_achou", "Pedido não encontrado."), alvo: corpo.id };
      return { resposta: json({ cancelado: r.cancelado, ja_terminado: r.ja_terminado }), alvo: corpo.id };
    },
    { limite: { prefixo: "relay-maestro", regra: REGRAS.relayMaestro } },
  );
}
