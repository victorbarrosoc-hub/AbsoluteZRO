/**
 * O que o login único conta aos apps: a organização ativa, o papel da pessoa, os produtos que ela pode usar e o
 * estado de lançamento de cada produto para ela (claim zro_release, ADR 0023). Sempre recalculado do banco na emissão
 * do token (vínculo ativo + entitlements vigentes + gate de lançamento no canal sso).
 * - zro_products: só produtos contratados E abertos para a pessoa (fechado nunca aparece como contratado).
 * - zro_release: { produto: released | allowed | closed } — released = aberto ao público; allowed = fechado, mas esta
 *   conta está na lista; closed = fechado e sem acesso. O app mostra a tela certa sem perguntar ao HUB de novo.
 */
import type { ClaimsLoader } from '@zro/auth'
import { productAccessFor, releaseClaimsFor } from '@zro/billing'

export const loadOidcClaims: ClaimsLoader = async (tx, userId, orgId) => {
  const release = await releaseClaimsFor(tx, userId, 'sso')
  if (!orgId) return { org: null, products: [], release }
  const [m] = await tx`
    select o.id, o.name, m.role from zro.memberships m join zro.organizations o on o.id = m.org_id
    where m.org_id = ${orgId} and m.user_id = ${userId} and m.status = 'active' and o.status = 'active'`
  if (!m) return { org: null, products: [], release }
  const access = await productAccessFor(tx, orgId, { userId, channel: 'sso' })
  return {
    org: { id: m.id as string, name: m.name as string, role: m.role as string },
    products: access.filter((a) => a.access === 'contracted').map((a) => a.productId),
    release,
  }
}
