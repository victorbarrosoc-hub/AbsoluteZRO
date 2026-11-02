import { nivelClaim, niveisEfetivos, productAccessFor, testeAtivoAte } from '@zro/billing'
import { authorize } from '@zro/core'
import { route } from '@/lib/api'

export const GET = route(async ({ db, auth }) => {
  const actor = await authorize(db, auth)
  const products = await db.asUser({ userId: actor.userId, orgId: actor.orgId }, (tx) => productAccessFor(tx, actor.orgId))
  // Nível por app (0055): o mesmo da claim zro_nivel do login único; teste_ate só com o teste do Absoluto em andamento.
  const { nivel, testeAte } = await db.asSystem('entitlements: níveis', async (tx) => ({
    nivel: nivelClaim(await niveisEfetivos(tx, actor.userId, actor.orgId)),
    testeAte: await testeAtivoAte(tx, actor.userId, actor.orgId),
  }))
  return { organization_id: actor.orgId, role: actor.role, products, nivel, teste_ate: testeAte?.toISOString() ?? null }
})
