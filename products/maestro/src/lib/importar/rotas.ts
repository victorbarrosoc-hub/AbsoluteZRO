/** `GET /api/importar/modelo/<tipo>`: o modelo de planilha, com a sessão (como toda rota de dados). Sem "server-only". */
import { erro } from "@/lib/http";
import { exigirAcesso } from "@/lib/auth/requisicao";
import { ehTipo, modeloCsv } from "./csv";

export async function rotaModelo(req: Request, tipo: string): Promise<Response> {
  const s = await exigirAcesso(req);
  if (s instanceof Response) return s;
  const t = tipo.replace(/\.csv$/, "");
  if (!ehTipo(t)) return erro(404, "nao_existe", "Modelo desconhecido.");
  return new Response(modeloCsv(t), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="maestro-${t}.csv"`,
      "cache-control": "private, max-age=3600",
    },
  });
}
