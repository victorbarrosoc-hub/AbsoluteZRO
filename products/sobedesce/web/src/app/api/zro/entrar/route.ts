import { entrar } from "@/lib/zro/rotas";

/** ?modo=entrar|vincular&volta=/conta → 302 para a Absolute ZRO (state, nonce e PKCE em cookie de 10 min). */
export function GET(req: Request) {
  return entrar(req);
}
