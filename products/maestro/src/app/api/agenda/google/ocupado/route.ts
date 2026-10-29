import { exigirAcesso } from "@/lib/auth/requisicao";
import { ocupadoNoGoogle } from "@/lib/agenda/sincronia";
import { diasEntre, ehData } from "@/lib/dinheiro";
import { erro, json } from "@/lib/http";

/**
 * GET /api/agenda/google/ocupado?de=AAAA-MM-DD&ate=AAAA-MM-DD — "Ocupado no Google" da pessoa da sessão (até 31 dias),
 * pela Agenda das Conexões da Absolute ZRO. Sempre 200 com `estado`: sem conexão, app desligado ou entrar de novo não
 * são erro da tela, são o que ela mostra.
 */
export async function GET(req: Request): Promise<Response> {
  const s = await exigirAcesso(req);
  if (s instanceof Response) return s;
  const q = new URL(req.url).searchParams;
  const de = q.get("de");
  const ate = q.get("ate") || de;
  if (!ehData(de) || !ehData(ate) || ate < de || diasEntre(de, ate) > 31) return erro(400, "datas", "Datas inválidas.");
  const r = await ocupadoNoGoogle(s.id, de, ate);
  return json(r, 200, { "cache-control": "private, no-store" });
}
