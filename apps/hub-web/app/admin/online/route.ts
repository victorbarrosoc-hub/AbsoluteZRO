/** /admin/online: quantas pessoas estão online agora (o número grande da visão geral pergunta a cada 15 s). */
import { onlineNow, requirePlatformAdmin } from '@zro/core'
import { db, getAuth } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Confere por conta própria: quem não é da plataforma vê 404, como no resto do console.
    requirePlatformAdmin(await getAuth(), ['admin', 'support'])
  } catch {
    return new Response('Não encontrado', { status: 404, headers: { 'cache-control': 'no-store' } })
  }
  const n = await db().asSystem('admin: online agora', (tx) => onlineNow(tx))
  return Response.json({ ...n, at: new Date().toISOString() }, { headers: { 'cache-control': 'no-store' } })
}
