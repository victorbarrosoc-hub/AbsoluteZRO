import { rotaMudar } from "@/lib/zro/console-drive";

/** POST /api/zro/console/drive/acesso `{ usuarioId, ligar }`: o console da Absolute ZRO liga ou desliga o Acesso total. */
export const POST = (req: Request) => rotaMudar(req);
