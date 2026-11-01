import { rotaLer } from "@/lib/zro/console-drive";

/** POST /api/zro/console/drive: o console da Absolute ZRO lê as vagas e o Acesso total de cada pessoa (lib/zro/console-drive.ts). */
export const POST = (req: Request) => rotaLer(req);
