import { getDatabase } from '@zro/db'

export const dynamic = 'force-dynamic'

/** Saúde do HUB: responde e alcança o banco. Não expõe versão, segredo nem dado de usuário. */
export async function GET() {
  try {
    await getDatabase().sql`select 1`
    return Response.json({ ok: true, database: 'ok' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ ok: false, database: 'indisponível' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
