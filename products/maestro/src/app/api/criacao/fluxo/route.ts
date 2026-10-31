import { getFluxo, postFluxo } from "@/lib/criacao/fluxo/rota";

/** O Fluxo da Criação: listar, carregar e "o que mudou desde" (GET); criar, mudar e as operações por nó (POST). */
export function GET(req: Request) {
  return getFluxo(req);
}

export function POST(req: Request) {
  return postFluxo(req);
}
