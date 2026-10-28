/**
 * Entitlements: o que cada organização pode usar agora (PRD §5.1, §9.2).
 * Fonte de verdade = assinaturas + concessões do console. Recalculado a cada mudança de assinatura, numa
 * transação com trava por organização. A API consulta esta tabela em toda operação de produto.
 */
import type { Queryable } from '@zro/db'
import { closedRelease, isReleaseOpen, RELEASE_CLOSED_MESSAGE, releaseAllows, type ReleaseChannel, type ReleaseChannels, type ReleaseState } from './release'

export type SubscriptionStatus = 'incomplete' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired'

export type SubscriptionRow = {
  id: string
  status: SubscriptionStatus
  current_period_start: Date | null
  current_period_end: Date | null
  cancel_at_period_end: boolean
  canceled_at: Date | null
  grace_until: Date | null
  created_at: Date
}

/**
 * Janela em que uma assinatura dá acesso. null = não dá acesso.
 * - trialing/active: até o fim do período (sem fim informado = sem data de término, só em concessão manual).
 * - past_due: até o fim da carência configurada no plano (grace_until); depois, bloqueia novas operações.
 * - canceled: se foi "cancelar no fim do período", vale até o fim do período; senão, acabou.
 * - incomplete/expired: nada.
 */
export function subscriptionWindow(sub: SubscriptionRow): { from: Date; until: Date | null } | null {
  const from = sub.current_period_start ?? sub.created_at
  switch (sub.status) {
    case 'trialing':
    case 'active':
      return { from, until: sub.current_period_end }
    case 'past_due':
      return { from, until: sub.grace_until ?? sub.current_period_end }
    case 'canceled':
      if (sub.cancel_at_period_end && sub.current_period_end && (!sub.canceled_at || sub.current_period_end > sub.canceled_at)) {
        return { from, until: sub.current_period_end }
      }
      return null
    default:
      return null
  }
}

export async function recomputeEntitlements(tx: Queryable, orgId: string, now = new Date()): Promise<number> {
  await tx`select pg_advisory_xact_lock(hashtextextended(${'entitlements:' + orgId}, 0))`
  await tx`update zro.entitlements set status = 'revoked', reason = coalesce(reason, 'recalculado')
           where org_id = ${orgId} and source = 'subscription' and status = 'active'`
  const subs = (await tx`
    select id, status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, grace_until, created_at, plan_id, provider
    from zro.subscriptions where org_id = ${orgId}`) as unknown as (SubscriptionRow & { plan_id: string; provider: string })[]
  let created = 0
  for (const sub of subs) {
    const w = subscriptionWindow(sub)
    if (!w || (w.until && w.until <= now)) continue
    // Ferramentas em desenvolvimento ficam de fora mesmo que algum plano as liste (PRD §4.3).
    const rows = await tx`
      insert into zro.entitlements (org_id, product_id, features, limits, source, source_id, starts_at, ends_at)
      select ${orgId}, pp.product_id, pp.features,
             -- Teste de conta nova: as ferramentas do plano com os créditos de IA e GPU do teste (migração 0011).
             case when ${sub.provider === 'trial'} and pp.limits ? 'zro.ai_credits'
               then pp.limits || jsonb_build_object('zro.ai_credits',
                 coalesce((select (s.value ->> 'ai_credits')::int from zro.platform_settings s where s.key = 'signup_trial'), 50))
               else pp.limits end,
             'subscription', ${sub.id}, ${w.from}, ${w.until}
      from zro.plan_products pp join zro.products p on p.id = pp.product_id
      where pp.plan_id = ${sub.plan_id} and p.stage in ('active', 'beta')
      returning id`
    created += rows.length
  }
  return created
}

export type EntitlementCheck =
  | { ok: true; entitlementId: string; source: string; endsAt: Date | null }
  | { ok: false; code: 'product_closed' | 'product_unavailable' | 'entitlement_required' | 'feature_not_included'; message: string; closed?: true }

/** Em nome de quem a checagem acontece: a pessoa (nula = anônimo) e o canal por onde ela chegou. */
export type EntitlementWho = { userId: string | null; channel: ReleaseChannel }

/**
 * Gate de lançamento (quando há `who`) + produto lançado + entitlement vigente + feature incluída, nessa ordem.
 * `who` vem de toda chamada em nome de uma pessoa (authorize): produto fechado para ela → `product_closed`, antes de
 * olhar o plano (PRD §5: fechado é fechado, mesmo com Completo). Sem `who` (worker e cálculo de plano) é só o
 * entitlement: a pessoa que disparou a operação já passou pelo gate.
 */
export async function checkEntitlement(
  tx: Queryable,
  orgId: string,
  productId: string,
  feature: string | null,
  opts: { who?: EntitlementWho; now?: Date } = {},
): Promise<EntitlementCheck> {
  const now = opts.now ?? new Date()
  const [product] = await tx`select name, stage from zro.products where id = ${productId}`
  if (!product) return { ok: false, code: 'product_unavailable', message: 'Esta ferramenta ainda não está disponível.' }
  if (opts.who && !(await releaseAllows(tx, productId, opts.who.userId, opts.who.channel))) {
    return { ok: false, code: 'product_closed', message: RELEASE_CLOSED_MESSAGE, closed: true }
  }
  if (!['active', 'beta'].includes(product.stage as string)) {
    return { ok: false, code: 'product_unavailable', message: `${product.name as string} ainda não está disponível.` }
  }
  const rows = await tx`
    select id, source, ends_at, features from zro.entitlements
    where org_id = ${orgId} and product_id = ${productId} and status = 'active'
      and starts_at <= ${now} and (ends_at is null or ends_at > ${now})
    order by ends_at desc nulls first`
  if (!rows.length) {
    return { ok: false, code: 'entitlement_required', message: `${product.name as string} não está no plano desta organização.` }
  }
  const match = rows.find((r) => !feature || r.features === null || (r.features as string[]).includes(feature))
  if (!match) return { ok: false, code: 'feature_not_included', message: 'Este recurso não está incluído no plano contratado.' }
  return { ok: true, entitlementId: match.id as string, source: match.source as string, endsAt: (match.ends_at as Date) ?? null }
}

export type ProductAccess = {
  productId: string
  name: string
  stage: string
  stepOrder: number
  roleInFlow: string
  integrationMode: string
  externalUrl: string | null
  /** Endereço do app que já começa o "Entrar com Absolute ZRO" (Abrir chega logado). */
  ssoStartUrl: string | null
  provisionalName: boolean
  /**
   * closed = fechado por lançamento para esta pessoa (nunca "contratada", mesmo que o plano liste o produto);
   * contracted = entitlement vigente; available = lançado e não contratado; coming_soon = em desenvolvimento no catálogo.
   */
  access: 'contracted' | 'available' | 'coming_soon' | 'disabled' | 'closed'
  endsAt: Date | null
  source: string | null
  /** Gate de lançamento (ADR 0023): estado do produto e se esta pessoa passa no canal pedido. */
  release: { state: ReleaseState; open: boolean; allowed: boolean; channels: ReleaseChannels }
}

/**
 * Catálogo com a situação da organização (Ferramentas, Ciclo do O, Início), já com o gate de lançamento aplicado.
 * A pessoa é `who.userId` ou, numa transação asUser, a da própria transação (zro.current_user_id()); sem nenhuma das
 * duas, é anônimo: produto fechado aparece como `closed`. Canal padrão: web.
 */
export async function productAccessFor(
  tx: Queryable,
  orgId: string | null,
  who: { userId?: string | null; channel?: ReleaseChannel } | null = null,
  now = new Date(),
): Promise<ProductAccess[]> {
  const userId = who?.userId ?? null
  const channel: ReleaseChannel = who?.channel ?? 'web'
  const rows = await tx`
    select p.id, p.name, p.stage, p.step_order, p.role_in_flow, p.integration_mode, p.external_url, p.sso_start_url, p.provisional_name,
           e.ends_at, e.source,
           r.state as release_state, r.web, r.desktop, r.api, r.download, r.sso,
           zro.release_allows(p.id, coalesce(${userId}::uuid, zro.current_user_id()), ${channel}) as allowed
    from zro.products p
    left join zro.product_release r on r.product_id = p.id
    left join lateral (
      select ends_at, source from zro.entitlements e
      where ${orgId}::uuid is not null and e.org_id = ${orgId}::uuid and e.product_id = p.id and e.status = 'active'
        and e.starts_at <= ${now} and (e.ends_at is null or e.ends_at > ${now})
      order by e.ends_at desc nulls first limit 1
    ) e on true
    order by p.step_order`
  return rows.map((r) => {
    const state = (r.release_state as ReleaseState | null) ?? 'development'
    const allowed = !!r.allowed
    return {
      productId: r.id as string,
      name: r.name as string,
      stage: r.stage as string,
      stepOrder: r.step_order as number,
      roleInFlow: r.role_in_flow as string,
      integrationMode: r.integration_mode as string,
      externalUrl: (r.external_url as string) ?? null,
      ssoStartUrl: (r.sso_start_url as string) ?? null,
      provisionalName: r.provisional_name as boolean,
      access: !allowed ? 'closed' : r.stage === 'disabled' ? 'disabled' : r.stage === 'coming_soon' ? 'coming_soon' : r.source ? 'contracted' : 'available',
      endsAt: (r.ends_at as Date) ?? null,
      source: (r.source as string) ?? null,
      release: {
        state,
        open: isReleaseOpen(state),
        allowed,
        channels: r.release_state
          ? { web: !!r.web, desktop: !!r.desktop, api: !!r.api, download: !!r.download, sso: !!r.sso }
          : closedRelease(r.id as string).channels,
      },
    }
  })
}
