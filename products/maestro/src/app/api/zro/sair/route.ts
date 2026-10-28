import { sair } from "@/lib/zro/rotas";

/** Encerra a sessão do Maestro, avisa a Absolute ZRO e volta à página inicial. */
export function POST(req: Request) {
  return sair(req);
}

export function GET(req: Request) {
  return sair(req);
}
