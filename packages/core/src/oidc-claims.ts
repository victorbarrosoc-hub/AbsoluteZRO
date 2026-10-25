/**
 * O que o login único conta aos apps sobre a organização: qual é, o papel da pessoa e os produtos contratados.
 * Sempre recalculado do banco na emissão do token (vínculo ativo + entitlements vigentes).
 */
import type { ClaimsLoader } from '@zro/auth'
import { productAccessFor } from '@zro/billing'

export const loadOidcClaims: ClaimsLoader = async (tx, userId, orgId) => {
  if (!orgId) return { org: null, products: [] }
  const [m] = await tx`
    select o.id, o.name, m.role from zro.memberships m join zro.organizations o on o.id = m.org_id
    where m.org_id = ${orgId} and m.user_id = ${userId} and m.status = 'active' and o.status = 'active'`
  if (!m) return { org: null, products: [] }
  const access = await productAccessFor(tx, orgId)
  return {
    org: { id: m.id as string, name: m.name as string, role: m.role as string },
    products: access.filter((a) => a.access === 'contracted').map((a) => a.productId),
  }
}
