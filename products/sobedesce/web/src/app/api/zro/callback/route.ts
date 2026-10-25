import { callback } from "@/lib/zro/rotas";

/** Volta da Absolute ZRO → 303 para `volta` com ?zro=ok ou ?erro=<codigo>. */
export function GET(req: Request) {
  return callback(req);
}
