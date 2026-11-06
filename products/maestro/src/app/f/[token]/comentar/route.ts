import { postComentarPublico } from "@/lib/criacao/fluxo/link-rota";

/** Comentar pelo link "Ver e comentar" do Fluxo: só o nome, sem conta (limite por link e IP). */
export function POST(req: Request, ctx: RouteContext<"/f/[token]/comentar">) {
  return postComentarPublico(req, ctx.params);
}
