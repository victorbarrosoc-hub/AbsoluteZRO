import { trocarConta } from "@/lib/zro/outra-conta";

/** "Entrar nessa conta" (lib/zro/outra-conta.ts): POST sem campos; o selo do callback diz para qual conta → 303. */
export function POST(req: Request) {
  return trocarConta(req);
}
