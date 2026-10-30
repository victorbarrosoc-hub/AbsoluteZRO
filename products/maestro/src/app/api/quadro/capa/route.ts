import { deleteCapa, postCapa } from "@/lib/quadro/rota";

/** A capa do card: pôr ou trocar (POST, os bytes da imagem) e tirar (DELETE), ?card=<id>. */
export function POST(req: Request) {
  return postCapa(req);
}

export function DELETE(req: Request) {
  return deleteCapa(req);
}
