import { liberadosPara } from '@/lib/data/catalog'
import { APPS_DESKTOP, catalogoDesktop } from '@/lib/desktop-apps'
import { ehAdmin, SO_PARA_ADMIN } from '@/lib/downloads'
import { getAuth } from '@/lib/session'

/**
 * Catálogo da central de apps da versão 1.3 (a 1.4 lê /api/v1/desktop/meus-apps, com o plano da conta; ADR 0049).
 * Gate de lançamento (ADR 0023): só os produtos com canal desktop aberto ao público ou liberados para a pessoa da
 * sessão; produto fechado não aparece. AEON, Revela, NOSSOM e Rift Motion só para admin de plataforma, que vê tudo.
 * O download (/baixar/app/<id>/<arquivo>) confere o plano de novo.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await getAuth()
  const gate = await liberadosPara(auth?.user.id ?? null, 'desktop')
  const liberados = ehAdmin(auth) ? new Set(APPS_DESKTOP.map((a) => a.id)) : new Set([...gate].filter((id) => !SO_PARA_ADMIN.has(id)))
  return Response.json(await catalogoDesktop(liberados), { headers: { 'Cache-Control': 'no-store' } })
}
