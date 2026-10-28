import 'server-only'
import { releaseClaimsFor, releaseState, salesStatus, type ReleaseChannel, type ReleaseChannels, type ReleaseState } from '@zro/billing'
import { db } from '../session'

/** Estado de lançamento de um produto no catálogo público (ADR 0023). Sem linha no banco = development, canais fechados. */
export type ReleasePublic = { state: ReleaseState; canais: ReleaseChannels }

export type CatalogProduct = {
  id: string
  name: string
  stage: string
  step_order: number
  role_in_flow: string
  description: string
  external_url: string | null
  provisional_name: boolean
  release: ReleasePublic
}

/**
 * Catálogo público (produtos e planos ativos). Só dados públicos; nada de organização. Cada produto traz `release`
 * (estado e canais abertos ao público) para a homepage, /baixar, o desktop e a navegação decidirem o que mostrar:
 * produto fechado é "Em desenvolvimento", sem Abrir/Baixar/Entrar.
 */
export async function publicCatalog() {
  return db().asSystem('site: catálogo público', async (tx) => {
    const rows = await tx`select id, name, stage, step_order, role_in_flow, description, external_url, provisional_name from zro.products order by step_order`
    const states = await releaseState(tx)
    const products: CatalogProduct[] = rows.map((p) => {
      const r = states[p.id as string]
      return {
        id: p.id as string,
        name: p.name as string,
        stage: p.stage as string,
        step_order: p.step_order as number,
        role_in_flow: p.role_in_flow as string,
        description: p.description as string,
        external_url: (p.external_url as string) ?? null,
        provisional_name: !!p.provisional_name,
        release: r
          ? { state: r.state, canais: r.channels }
          : { state: 'development', canais: { web: false, desktop: false, api: false, download: false, sso: false } },
      }
    })
    const plans = await tx`
      select p.id, p.code, p.version, p.name, p.kind, p.price_cents, p.currency, p.billing_interval, p.trial_days, p.description,
             max((pp.limits ->> 'zro.ai_credits')::int) as ai_credits,
             coalesce(json_agg(json_build_object('product_id', pp.product_id, 'limits', pp.limits) order by pr.step_order) filter (where pp.product_id is not null), '[]') as products
      from zro.plans p left join zro.plan_products pp on pp.plan_id = p.id left join zro.products pr on pr.id = pp.product_id
      where p.status = 'active' group by p.id order by case p.kind when 'free' then 0 when 'bundle' then 1 else 2 end, p.name`
    return { products, plans, sales: await salesStatus(tx) }
  })
}

/** Aberto ao público (released ou public_beta). O que não está assim é "Em desenvolvimento". */
export const releaseOpen = (r: ReleasePublic) => r.state === 'released' || r.state === 'public_beta'

/**
 * Produtos que esta pessoa pode ver como disponíveis no canal: abertos ao público nesse canal ou com ela na lista de
 * acesso (zro.release_allows, sem cache). Anônimo (`null`) = só o que está aberto ao público.
 */
export async function liberadosPara(userId: string | null, channel: ReleaseChannel = 'web'): Promise<Set<string>> {
  const claims = await db().asSystem('site: produtos liberados', (tx) => releaseClaimsFor(tx, userId, channel))
  return new Set(
    Object.entries(claims)
      .filter(([, c]) => c !== 'closed')
      .map(([id]) => id),
  )
}

export function priceLabel(p: { price_cents: number | null; currency: string | null; billing_interval: string | null; kind: string }) {
  if (p.kind === 'free') return 'Gratuita'
  if (p.price_cents == null || !p.currency) return 'Preço a definir'
  const v = (p.price_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: p.currency })
  return p.billing_interval ? `${v} / ${p.billing_interval === 'month' ? 'mês' : 'ano'}` : v
}

/**
 * Os apps da família no menu do HUB (uma consulta só, a cada página): lançados ou liberados para a pessoa no canal web
 * (zro.release_allows, sem cache) e com site oficial no catálogo.
 */
export async function familiaPara(userId: string): Promise<{ productId: string; name: string; href: string }[]> {
  const rows = await db().asSystem(
    'hub: apps da família no menu',
    (tx) => tx`
      select id, name, external_url from zro.products
      where external_url is not null and zro.release_allows(id, ${userId}::uuid, 'web') order by step_order`,
  )
  return rows.map((r) => ({ productId: r.id as string, name: r.name as string, href: r.external_url as string }))
}
