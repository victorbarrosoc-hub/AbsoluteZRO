import { rotaResumoDaZ } from "@/lib/zro/resumo-da-z";

/** O dia da produtora para a Z (só leitura), pedido assinado pela Absolute ZRO. Ligado: a ferramenta ver_maestro da Z do HUB. */
export function POST(req: Request) {
  return rotaResumoDaZ(req);
}
