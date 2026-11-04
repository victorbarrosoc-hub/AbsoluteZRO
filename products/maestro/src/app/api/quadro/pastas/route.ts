import { getPastas } from "@/lib/quadro/rota";

/** A sugestão das pastas do card (Brutos e Entrega) pela estrutura do projeto no Drive. */
export function GET(req: Request) {
  return getPastas(req);
}
