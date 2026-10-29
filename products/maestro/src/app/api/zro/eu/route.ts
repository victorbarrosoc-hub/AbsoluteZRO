import { eu } from "@/lib/zro/rotas";

/** Quem está logado no Maestro, com `acesso` relido na Absolute ZRO (no máximo uma vez por minuto). 401 sem sessão. */
export function GET(req: Request) {
  return eu(req);
}
