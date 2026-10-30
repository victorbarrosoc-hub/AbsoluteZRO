import { REGRAS } from "@/lib/auth/limite";
import { erro, json } from "@/lib/http";
import { atenderPedidoDoMaestro, respostaDoMaestro } from "@/lib/zro/maestro-rota";
import { ACAO_RELAY_CONVERTER, lerConverter, pedirVersoes } from "@/lib/zro/relay";

const STATUS = { nao_achou: 404, pasta: 400, formato_incompativel: 400, fila_cheia: 429 } as const;

/**
 * POST /api/zro/relay/converter `{ arquivoId, presets (1–8), pastaId?, ref, conta? }` (contrato "Maestro → Relay",
 * docs/integration-contracts/relay.md): uma versão na fila por preset, para o computador da conta converter e subir
 * na pasta. Idempotente pela chave `ref:preset`. 202 `{ pedidos: [{ id, preset, ref, status }] }`.
 */
export async function POST(req: Request): Promise<Response> {
  return atenderPedidoDoMaestro(
    req,
    ACAO_RELAY_CONVERTER,
    async (usuarioId, corpo) => {
      const e = lerConverter(corpo);
      if ("erro" in e) return { resposta: erro(400, "entrada", e.erro) };
      const r = await pedirVersoes(usuarioId, e);
      if (r.ok) return { resposta: json({ pedidos: r.pedidos }, 202), alvo: e.arquivoId };
      if (!("mensagem" in r)) return { resposta: respostaDoMaestro(r), alvo: e.arquivoId };
      return { resposta: erro(STATUS[r.erro], r.erro, r.mensagem), alvo: e.arquivoId };
    },
    { limite: { prefixo: "relay-maestro", regra: REGRAS.relayMaestro } },
  );
}
