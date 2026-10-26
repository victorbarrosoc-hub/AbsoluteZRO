import 'server-only'
import { salesStatus } from '@zro/billing'
import { db } from '../session'

/** Catálogo público (produtos e planos ativos). Só dados públicos; nada de organização. */
export async function publicCatalog() {
  return db().asSystem('site: catálogo público', async (tx) => {
    const products =
      await tx`select id, name, stage, step_order, role_in_flow, description, external_url, provisional_name from zro.products order by step_order`
    const plans = await tx`
      select p.id, p.code, p.version, p.name, p.kind, p.price_cents, p.currency, p.billing_interval, p.trial_days, p.description,
             max((pp.limits ->> 'zro.ai_credits')::int) as ai_credits,
             coalesce(json_agg(json_build_object('product_id', pp.product_id, 'limits', pp.limits) order by pr.step_order) filter (where pp.product_id is not null), '[]') as products
      from zro.plans p left join zro.plan_products pp on pp.plan_id = p.id left join zro.products pr on pr.id = pp.product_id
      where p.status = 'active' group by p.id order by case p.kind when 'free' then 0 when 'bundle' then 1 else 2 end, p.name`
    return { products, plans, sales: await salesStatus(tx) }
  })
}

export function priceLabel(p: { price_cents: number | null; currency: string | null; billing_interval: string | null; kind: string }) {
  if (p.kind === 'free') return 'Gratuita'
  if (p.price_cents == null || !p.currency) return 'Preço a definir'
  const v = (p.price_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: p.currency })
  return p.billing_interval ? `${v} / ${p.billing_interval === 'month' ? 'mês' : 'ano'}` : v
}
