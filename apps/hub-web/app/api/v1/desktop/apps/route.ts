import { catalogoDesktop } from '@/lib/desktop-apps'
import { liberadosPara } from '@/lib/data/catalog'
import { getAuth } from '@/lib/session'

/**
 * Catálogo da central de apps (o app Absolute ZRO para computador lê daqui): os mesmos instaladores da página de
 * downloads, com versão e SHA-256 de cada arquivo. Gate de lançamento (ADR 0023): só os produtos com canal desktop
 * aberto ao público ou liberados para a pessoa da sessão; produto fechado não aparece. Quem pode usar cada ferramenta
 * continua decidido na conta.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await getAuth()
  const liberados = await liberadosPara(auth?.user.id ?? null, 'desktop')
  return Response.json(await catalogoDesktop(liberados), { headers: { 'Cache-Control': 'no-store' } })
}
