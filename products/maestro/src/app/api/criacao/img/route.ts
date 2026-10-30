import { postImagem } from "@/lib/criacao/fluxo/rota";

/** Imagem colada no Fluxo: o servidor confere, reencoda em WebP (com miniatura) e grava, dentro da cota. */
export function POST(req: Request) {
  return postImagem(req);
}
