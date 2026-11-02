import { p2pWifiLigado, respostaWifiDesligado } from "@/lib/p2p/ligado";
import { exigirNaApi } from "@/lib/auth/requisicao";
import { erro, ipDe, json, lerJson } from "@/lib/http";
import { mandarSinal, SinalError, sinalSchema } from "@/lib/p2p/sinais";

/** Oferta, resposta, recusa ou cancela para outro aparelho: da conta ou alguém por perto (docs/CELULAR-WIFI.md). */
export async function POST(req: Request) {
  // Desligado até a fase 3 (lib/p2p/ligado.ts): responde na hora, antes da sessão e do banco.
  if (!p2pWifiLigado()) return respostaWifiDesligado();
  const atual = await exigirNaApi(req, { mutacao: true });
  if (atual instanceof Response) return atual;
  const corpo = await lerJson(req, 64 * 1024);
  const r = sinalSchema.safeParse(corpo);
  if (!r.success) return erro(400, "invalido", "Pedido inválido.");
  try {
    const id = await mandarSinal(atual, r.data, ipDe(req.headers));
    return json({ id }, 201);
  } catch (e) {
    if (e instanceof SinalError) return erro(e.status, e.codigo, e.message);
    throw e;
  }
}
