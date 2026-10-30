import { getArquivoPublico } from "@/lib/criacao/fluxo/link-rota";

/** O fluxo do link em `maestro.fluxo/1` (`/f/<token>.json` chega aqui pela reescrita). */
export async function GET(req: Request, ctx: RouteContext<"/f/[token]/fluxo.json">) {
  const { token } = await ctx.params;
  return getArquivoPublico(req, token, "json");
}
