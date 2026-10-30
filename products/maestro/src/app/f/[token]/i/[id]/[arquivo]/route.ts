import { getImagemPublica } from "@/lib/criacao/fluxo/link-rota";

/** Uma imagem do fluxo pelo token do link (acabou o link, acabou a imagem). */
export function GET(req: Request, ctx: RouteContext<"/f/[token]/i/[id]/[arquivo]">) {
  return getImagemPublica(req, ctx.params);
}
