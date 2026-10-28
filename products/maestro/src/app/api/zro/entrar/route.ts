import { entrar } from "@/lib/zro/rotas";

/** ?modo=entrar|criar&volta=/app/quadro → 302 para a Absolute ZRO (state, nonce e PKCE em cookie selado de 10 min). */
export function GET(req: Request) {
  return entrar(req);
}
