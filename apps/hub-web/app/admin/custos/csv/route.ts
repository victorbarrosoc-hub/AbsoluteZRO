/** /admin/custos/csv: os custos em planilha. Só admin da plataforma; para os outros a rota não existe (404). */
import { custosCsv, hojeNoFuso, lerConfigCustos, listarCustos, requirePlatformAdmin, type UserActor } from '@zro/core'
import { audit } from '@zro/observability'
import { db, getAuth } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET() {
  let who: UserActor
  try {
    who = requirePlatformAdmin(await getAuth(), ['admin'])
  } catch {
    return new Response('Não encontrado', { status: 404 })
  }
  const csv = await db().asSystem('admin: exportar custos', async (tx) => {
    const [custos, config] = await Promise.all([listarCustos(tx), lerConfigCustos(tx)])
    await audit(tx, { actorUserId: who.userId, actorKind: 'admin', action: 'admin.custos_exportados', targetType: 'custo', metadata: { rows: custos.length } })
    return custosCsv(custos, config)
  })
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="absolutezro-custos-${hojeNoFuso()}.csv"`,
      'cache-control': 'no-store',
    },
  })
}
