import { getQuadro, postQuadro } from "@/lib/quadro/rota";

/** O Quadro: carregar e "o que mudou desde" (GET), gravar por campo (POST). */
export function GET(req: Request) {
  return getQuadro(req);
}

export function POST(req: Request) {
  return postQuadro(req);
}
