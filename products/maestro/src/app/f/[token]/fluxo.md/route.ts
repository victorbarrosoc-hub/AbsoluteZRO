import { getArquivoPublico } from "@/lib/criacao/fluxo/link-rota";

/** O fluxo do link em Markdown, para IA que lê endereço (`/f/<token>.md` chega aqui pela reescrita). */
export async function GET(req: Request, ctx: RouteContext<"/f/[token]/fluxo.md">) {
  const { token } = await ctx.params;
  return getArquivoPublico(req, token, "md");
}
