import { getLinks, postLinks } from "@/lib/criacao/fluxo/link-rota";

/** Links de exportação do Fluxo: os vivos (GET); criar e revogar (POST). Só administração e gestão. */
export function GET(req: Request) {
  return getLinks(req);
}

export function POST(req: Request) {
  return postLinks(req);
}
