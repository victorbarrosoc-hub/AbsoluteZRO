import { rotaMinha } from "@/lib/agenda/rotas";

/** Baixar a própria agenda (.ics) com a sessão: o mesmo conteúdo do endereço secreto. */
export function GET(req: Request) {
  return rotaMinha(req);
}
