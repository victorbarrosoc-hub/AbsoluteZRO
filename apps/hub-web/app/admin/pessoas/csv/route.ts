/** /admin/pessoas/csv: a lista do painel (mesma busca e filtros) em planilha. Quem não é da plataforma vê 404. */
import { listPeople, parsePeopleFilter, peopleCsv, peopleFilterQuery, requirePlatformAdmin, type UserActor } from '@zro/core'
import { audit } from '@zro/observability'
import { db, getAuth } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  let who: UserActor
  try {
    who = requirePlatformAdmin(await getAuth(), ['admin', 'support'])
  } catch {
    return new Response('Não encontrado', { status: 404 })
  }
  const filter = parsePeopleFilter(new URL(req.url).searchParams)
  const rows = await db().asSystem('admin: exportar pessoas', async (tx) => {
    const r = await listPeople(tx, filter, 10_000)
    // Exportar dados pessoais fica na auditoria (quem, quando, com que filtro e quantas linhas).
    await audit(tx, {
      actorUserId: who.userId,
      actorKind: 'admin',
      action: 'admin.people_exported',
      targetType: 'user',
      metadata: { filter: peopleFilterQuery(filter), rows: r.rows.length },
    })
    return r.rows
  })
  const day = new Date().toISOString().slice(0, 10)
  return new Response(peopleCsv(rows), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="absolutezro-pessoas-${day}.csv"`,
      'cache-control': 'no-store',
    },
  })
}
