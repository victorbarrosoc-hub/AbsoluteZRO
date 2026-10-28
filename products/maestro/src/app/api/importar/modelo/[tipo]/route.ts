import { rotaModelo } from "@/lib/importar/rotas";

/** O modelo de planilha (.csv) de cada tipo: cabeçalho em português e uma linha de exemplo. */
export async function GET(req: Request, ctx: RouteContext<"/api/importar/modelo/[tipo]">) {
  const { tipo } = await ctx.params;
  return rotaModelo(req, tipo);
}
