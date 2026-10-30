import { REGRAS } from "@/lib/auth/limite";
import { erro, json } from "@/lib/http";
import { atenderPedidoDoMaestro } from "@/lib/zro/maestro-rota";
import { ACAO_RELAY_PEDIDO, lerVersoes, MAX_IDS } from "@/lib/zro/relay";

const ID = /^[A-Za-z0-9_.:-]{1,120}$/;

/**
 * POST /api/zro/relay/pedido `{ ids (0 a 50) }`: o estado de cada versão (pedido que não é desta pessoa, ou que sumiu
 * da fila, não vem) e os computadores da conta: aberto agora, usado há pouco, se algum converte (`relay`, app 0.2.0
 * ou mais novo) ou se só há app antigo (`desatualizado`). Sem ids, só os computadores. Só lê: sem auditoria.
 */
export async function POST(req: Request): Promise<Response> {
  return atenderPedidoDoMaestro(
    req,
    ACAO_RELAY_PEDIDO,
    async (usuarioId, corpo) => {
      const ids = corpo.ids;
      if (Object.keys(corpo).some((k) => k !== "ids") || !Array.isArray(ids) || ids.length > MAX_IDS || !ids.every((i) => typeof i === "string" && ID.test(i)))
        return { resposta: erro(400, "entrada", `Mande ids: de 0 a ${MAX_IDS} pedidos.`) };
      return { resposta: json(await lerVersoes(usuarioId, [...new Set(ids as string[])])) };
    },
    { limite: { prefixo: "relay-acompanhar", regra: REGRAS.relayAcompanharMaestro }, auditar: false },
  );
}
