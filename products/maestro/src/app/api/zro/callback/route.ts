import { callback } from "@/lib/zro/rotas";

/** Volta da Absolute ZRO → 303 para `volta` (ou /sem-acesso) com a sessão, ou /entrar?erro=<codigo>. */
export function GET(req: Request) {
  return callback(req);
}
