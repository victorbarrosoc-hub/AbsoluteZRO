import { rotaResumoDaZ } from "@/lib/zro/resumo-da-z";

/** O dia da produtora para a Z (só leitura), pedido assinado pela Absolute ZRO. Pronto e desligado no HUB. */
export function POST(req: Request) {
  return rotaResumoDaZ(req);
}
