import { catalogoLimites, NIVEIS, zCatalogo } from '@zro/billing'
import { route } from '@/lib/api'

/**
 * Catálogo público dos limites por nível (ADR 0039): só números, nada de pessoa, e só dos apps abertos ao público.
 * Cacheável: muda só quando a administração edita um número no console.
 */
export const GET = route(async ({ db }) => {
  const body = await db.asSystem('api: catálogo de limites', async (tx) => ({
    niveis: NIVEIS,
    produtos: await catalogoLimites(tx, null),
    z: await zCatalogo(tx),
  }))
  return Response.json(body, {
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600', 'Access-Control-Allow-Origin': '*' },
  })
})
