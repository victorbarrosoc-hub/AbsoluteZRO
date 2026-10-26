import { catalogoDesktop } from '@/lib/desktop-apps'

/**
 * Catálogo da central de apps (o app Absolute ZRO para computador lê daqui). Público: são os mesmos instaladores da
 * página de downloads, com versão e SHA-256 de cada arquivo. Quem pode usar cada ferramenta continua decidido na conta.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json(await catalogoDesktop(), { headers: { 'Cache-Control': 'no-store' } })
}
