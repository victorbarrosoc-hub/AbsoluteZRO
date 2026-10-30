import { getPacote } from "@/lib/criacao/fluxo/link-rota";

/** "Baixar pacote": o .zip do fluxo (fluxo.md, fluxo.json e imagens/), sem link nenhum. */
export function GET(req: Request) {
  return getPacote(req);
}
