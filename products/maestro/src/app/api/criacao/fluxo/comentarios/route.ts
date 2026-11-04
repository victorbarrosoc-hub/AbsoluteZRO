import { getComentarios, postComentarios } from "@/lib/criacao/fluxo/link-rota";

/** Os comentários de quem abriu um link "Ver e comentar": ler (quem vê a Criação) e apagar (quem edita). */
export function GET(req: Request) {
  return getComentarios(req);
}

export function POST(req: Request) {
  return postComentarios(req);
}
