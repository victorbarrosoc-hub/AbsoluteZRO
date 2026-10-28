import { rotaLogo } from "@/lib/marca/rota";

/** O logo da produtora (WebP reencodado no servidor), pela organização e o sha256: cache imutável. */
export function GET(req: Request, ctx: RouteContext<"/api/marca/[org]/[sha]">) {
  return rotaLogo(req, ctx.params);
}
