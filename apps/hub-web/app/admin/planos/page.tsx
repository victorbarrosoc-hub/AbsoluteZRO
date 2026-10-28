import type { Metadata } from 'next'
import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { providerLabel, salesStatus } from '@zro/billing'
import { requirePlatformAdmin } from '@zro/core'
import { Field, Notice, Pill, ProductMark } from '@zro/ui'
import { ActionForm } from '@/components/action-form'
import { Fold } from '@/components/admin/parts'
import {
  assignPlanAction,
  cancelSubscriptionAction,
  createPlanVersionAction,
  grantAction,
  launchSalesAction,
  publishPlanAction,
  resolvePlanRequestAction,
  revokeGrantAction,
} from '@/lib/actions/admin'
import { fmtAgo, fmtDate, fmtDay, LIMIT_LABEL, limitText } from '@/lib/labels'
import { db, getAuth } from '@/lib/session'
import { stripeConfig } from '@/lib/stripe'

export const metadata: Metadata = { title: 'Planos · Console', robots: { index: false, follow: false } }

const KIND: Record<string, string> = { free: 'Grátis', individual: 'Avulso', bundle: 'Pacote', team: 'Equipe' }
const STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'faint' }> = {
  active: { label: 'À venda', tone: 'ok' },
  draft: { label: 'Rascunho', tone: 'warn' },
  retired: { label: 'Fora de venda', tone: 'faint' },
}
const SUB_STATUS: Record<string, string> = { active: 'ativa', trialing: 'em teste', past_due: 'em atraso' }

const brl = (cents: number | null) =>
  cents == null ? 'Preço a definir' : (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: cents % 100 ? 2 : 0 })

type PlanProduct = { product: string; limits: Record<string, number> | null }

export default async function Planos() {
  const auth = await getAuth()
  // Layout e página renderizam em paralelo no Next: a página confere por conta própria.
  if (!auth?.user.platformRole || !auth.user.emailVerified) notFound()
  requirePlatformAdmin(auth, ['admin', 'support'])
  const isAdmin = auth.user.platformRole === 'admin'
  const d = await db().asSystem('admin: planos', async (tx) => ({
    orgs: await tx`select id, name from zro.organizations where status = 'active' order by lower(name) limit 1000`,
    subs: await tx`
      select s.id, s.status, s.provider, s.current_period_end, o.name as org, p.name as plan, p.billing_interval
      from zro.subscriptions s join zro.organizations o on o.id = s.org_id join zro.plans p on p.id = s.plan_id
      where s.status in ('active', 'trialing', 'past_due') and s.provider <> 'free' order by s.created_at desc limit 100`,
    freeCount: await tx`select count(*)::int as n from zro.subscriptions where provider = 'free' and status in ('active', 'trialing', 'past_due')`,
    grants: await tx`
      select e.id, e.product_id, pr.name as product, e.limits, e.ends_at, e.reason, o.name as org
      from zro.entitlements e join zro.organizations o on o.id = e.org_id join zro.products pr on pr.id = e.product_id
      where e.source = 'admin_grant' and e.status = 'active' order by e.created_at desc limit 100`,
    plans: await tx`
      select p.id, p.code, p.version, p.name, p.kind, p.status, p.grace_days, p.price_cents, p.billing_interval,
        (select json_agg(json_build_object('product', pp.product_id, 'limits', pp.limits) order by pr.step_order)
           from zro.plan_products pp join zro.products pr on pr.id = pp.product_id where pp.plan_id = p.id) as products
      from zro.plans p order by p.status, p.kind, p.name, p.billing_interval nulls first, p.version desc`,
    products: await tx`select id, name from zro.products order by step_order`,
    sales: await salesStatus(tx),
    requests: await tx`
      select r.id, r.kind, r.created_at, o.name as org, u.display_name as who, u.email, p.name as plan
      from zro.plan_requests r join zro.organizations o on o.id = r.org_id join zro.users u on u.id = r.requested_by
      left join zro.plans p on p.id = r.plan_id where r.status = 'open' order by r.created_at limit 100`,
  }))
  const nameOf = new Map(d.products.map((p) => [p.id as string, p.name as string]))
  const forSale = d.plans.filter((p) => p.status === 'active')
  // Mensal e anual do mesmo plano viram um cartão só.
  const same = (a: (typeof forSale)[number], b: (typeof forSale)[number]) => a.name === b.name && a.kind === b.kind
  const yearly = forSale.filter((p) => p.billing_interval === 'year')
  const cards = [
    ...forSale.filter((p) => p.billing_interval !== 'year').map((p) => ({ p, year: yearly.find((y) => same(y, p)) })),
    ...yearly.filter((y) => !forSale.some((p) => p.billing_interval !== 'year' && same(y, p))).map((p) => ({ p, year: undefined })),
  ]
  const others = d.plans.filter((p) => p.status !== 'active')

  return (
    <div className="page adm-page">
      <header className="adm-head">
        <h1>Planos</h1>
        <p>O que está à venda, quem pediu e o que foi dado à mão.</p>
      </header>
      {!isAdmin && <Notice title="Só leitura">Conceder e cancelar exige papel admin.</Notice>}

      <div className="adm-status-row">
        <div className="adm-status">
          <span className={`adm-dot${d.sales.launched ? ' adm-dot--ok' : ''}`} aria-hidden="true" />
          <span>
            <strong>{d.sales.launched ? 'Vendas ligadas' : 'Vendas desligadas'}</strong>
            <span className="zro-faint">
              {d.sales.launched
                ? ` · desde ${fmtDay(new Date(d.sales.at))} · ${d.sales.trialDays} dias de teste`
                : !stripeConfig()
                  ? ' · faltam as chaves do Stripe'
                  : ' · contas novas entram no grátis'}
            </span>
          </span>
        </div>
        <span className="adm-chip">{(d.freeCount[0]?.n as number) ?? 0} organizações no grátis</span>
      </div>

      {!d.sales.launched && stripeConfig() && isAdmin && (
        <Fold title="Ligar vendas" meta="Stripe">
          <ActionForm action={launchSalesAction} submit="Ligar vendas" className="zro-form">
            <p className="zro-mute">Conta nova ganha dias de teste do Completo. Quem já usava segue liberado até a data de corte.</p>
            <div className="zro-form-row">
              <Field label="Grátis antigo vale até" htmlFor="vendas-corte">
                <input className="zro-input" id="vendas-corte" type="date" name="cutoff" required />
              </Field>
              <Field label="Dias de teste" htmlFor="vendas-teste">
                <input className="zro-input" id="vendas-teste" type="number" name="trialDays" min={0} max={30} defaultValue={7} required />
              </Field>
            </div>
            <Field label="Motivo" htmlFor="vendas-motivo" hint="Fica na auditoria.">
              <input className="zro-input" id="vendas-motivo" name="reason" required />
            </Field>
          </ActionForm>
        </Fold>
      )}

      <Fold
        id="pedidos"
        title="Pedidos"
        meta={d.requests.length ? <Pill tone="warn">{d.requests.length}</Pill> : <Pill tone="ok">Nenhum</Pill>}
        open={d.requests.length > 0}
      >
        {d.requests.length ? (
          <ul className="adm-rows">
            {d.requests.map((r) => (
              <li key={r.id as string} className="adm-rows__wide">
                <span>
                  <strong>{r.org as string}</strong> quer {r.kind === 'renew' ? 'renovar' : <strong>{r.plan as string}</strong>}
                  <span className="zro-faint" title={`${r.who as string} · ${r.email as string} · ${fmtDate(r.created_at as Date)}`}>
                    {' '}
                    · {fmtAgo(r.created_at as Date)}
                  </span>
                </span>
                {isAdmin && (
                  <ActionForm action={resolvePlanRequestAction} submit="Atendido" variant="ghost" className="row adm-inline-form" inlineSubmit>
                    <input type="hidden" name="requestId" value={r.id as string} />
                    <input className="zro-input" name="reason" placeholder="Motivo" required aria-label={`Motivo: pedido de ${r.org as string}`} />
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="adm-empty">Ninguém pediu nada.</p>
        )}
      </Fold>

      <section className="adm-card" aria-labelledby="a-venda">
        <h2 id="a-venda">À venda</h2>
        <ul className="plan-cards">
          {cards.map(({ p, year }, i) => (
            <PlanCard key={p.id as string} p={p} year={year} i={i} nameOf={nameOf} />
          ))}
        </ul>
      </section>

      <Fold title="Dado à mão" meta={`${d.subs.length + d.grants.length}`} >
        <h3 className="adm-sub">Assinaturas</h3>
        {d.subs.length ? (
          <ul className="adm-rows">
            {d.subs.map((s) => (
              <li key={s.id as string} className="adm-rows__wide">
                <span>
                  <strong>{s.org as string}</strong> · {s.plan as string}
                  {s.billing_interval === 'year' ? ' anual' : ''}{' '}
                  <span className="zro-faint">
                    · {providerLabel(s.provider as string)} · {SUB_STATUS[s.status as string] ?? (s.status as string)}
                    {s.current_period_end ? ` · até ${fmtDay(s.current_period_end as Date)}` : ''}
                  </span>
                </span>
                {isAdmin && s.provider === 'manual' && (
                  <details className="adm-confirm">
                    <summary className="zro-btn zro-btn--small">Cancelar…</summary>
                    <ActionForm action={cancelSubscriptionAction} submit="Cancelar assinatura" variant="danger" className="stack" inlineSubmit>
                      <input type="hidden" name="subscriptionId" value={s.id as string} />
                      <select className="zro-select" name="when" aria-label="Quando">
                        <option value="end">No fim do período</option>
                        <option value="now">Agora</option>
                      </select>
                      <input className="zro-input" name="reason" placeholder="Motivo" required aria-label={`Motivo: cancelar ${s.org as string}`} />
                    </ActionForm>
                  </details>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="adm-empty">Nenhuma assinatura manual ou paga.</p>
        )}
        <h3 className="adm-sub">Apps liberados por concessão</h3>
        {d.grants.length ? (
          <ul className="adm-rows">
            {d.grants.map((g) => {
              const limits = Object.entries((g.limits as Record<string, number>) ?? {})
              return (
                <li key={g.id as string} className="adm-rows__wide">
                  <span className="row">
                    <ProductMark productId={g.product_id as string} name={g.product as string} size={22} />
                    <span>
                      <strong>{g.org as string}</strong> · {g.product as string}
                      <span className="zro-faint">
                        {limits.length ? ` · ${limits.map(([k, v]) => limitText(k, v)).join(' · ')}` : ''}
                        {g.ends_at ? ` · até ${fmtDay(g.ends_at as Date)}` : ''}
                        {g.reason ? ` · ${g.reason as string}` : ''}
                      </span>
                    </span>
                  </span>
                  {isAdmin && (
                    <details className="adm-confirm">
                      <summary className="zro-btn zro-btn--small">Revogar…</summary>
                      <ActionForm action={revokeGrantAction} submit="Revogar" variant="danger" className="row" inlineSubmit>
                        <input type="hidden" name="entitlementId" value={g.id as string} />
                        <input className="zro-input" name="reason" placeholder="Motivo" required aria-label={`Motivo: revogar ${g.product as string}`} />
                      </ActionForm>
                    </details>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="adm-empty">Nenhuma concessão ativa.</p>
        )}
      </Fold>

      {isAdmin && (
        <div className="adm-grid">
          <Fold title="Dar um plano">
            <ActionForm action={assignPlanAction} submit="Dar plano">
              <p className="zro-mute">A organização passa a ter o plano agora. Para trocar o de uma pessoa, abra a ficha dela em Pessoas.</p>
              <Field label="Organização" htmlFor="ap-org">
                <select className="zro-select" id="ap-org" name="orgId" required>
                  {d.orgs.map((o) => (
                    <option key={o.id as string} value={o.id as string}>
                      {o.name as string}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Plano" htmlFor="ap-plan">
                <select className="zro-select" id="ap-plan" name="planId" required>
                  {forSale.map((p) => (
                    <option key={p.id as string} value={p.id as string}>
                      {p.name as string}
                      {p.billing_interval === 'year' ? ' · anual' : p.billing_interval === 'month' ? ' · mensal' : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Até (opcional)" htmlFor="ap-until" hint="Vazio = sem fim.">
                <input className="zro-input" id="ap-until" name="until" type="date" />
              </Field>
              <Field label="Motivo" htmlFor="ap-reason">
                <input className="zro-input" id="ap-reason" name="reason" required />
              </Field>
            </ActionForm>
          </Fold>
          <Fold title="Liberar um app">
            <ActionForm action={grantAction} submit="Liberar">
              <p className="zro-mute">Abre um app para a organização, além do plano dela.</p>
              <Field label="Organização" htmlFor="g-org">
                <select className="zro-select" id="g-org" name="orgId" required>
                  {d.orgs.map((o) => (
                    <option key={o.id as string} value={o.id as string}>
                      {o.name as string}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="App" htmlFor="g-prod">
                <select className="zro-select" id="g-prod" name="productId" required>
                  {d.products.map((p) => (
                    <option key={p.id as string} value={p.id as string}>
                      {p.name as string}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Créditos de IA por mês (opcional)" htmlFor="g-ai">
                <input className="zro-input" id="g-ai" name="aiCredits" inputMode="numeric" pattern="[0-9]*" />
              </Field>
              <Field label="Até (opcional)" htmlFor="g-until">
                <input className="zro-input" id="g-until" name="until" type="date" />
              </Field>
              <Field label="Motivo" htmlFor="g-reason">
                <input className="zro-input" id="g-reason" name="reason" required />
              </Field>
              <details className="disclosure">
                <summary>Avançado</summary>
                <Field label="Só estas funções (separadas por vírgula)" htmlFor="g-feat" hint="Vazio = todas.">
                  <input className="zro-input" id="g-feat" name="features" />
                </Field>
                <Field label="Outros limites (JSON)" htmlFor="g-lim" hint='Ex.: {"sobedesce.manifest_imports": 100}'>
                  <input className="zro-input" id="g-lim" name="limits" />
                </Field>
              </details>
            </ActionForm>
          </Fold>
        </div>
      )}

      <Fold title="Rascunhos e versões antigas" meta={`${others.length}`}>
        <ul className="plan-cards">
          {others.map((p, i) => (
            <PlanCard key={p.id as string} p={p} i={i} nameOf={nameOf}>
              {isAdmin && p.status === 'draft' && (
                <ActionForm action={publishPlanAction} submit="Publicar" variant="ghost" className="row" inlineSubmit>
                  <input type="hidden" name="planId" value={p.id as string} />
                  <input className="zro-input" name="reason" placeholder="Motivo" required aria-label={`Motivo: publicar ${p.name as string}`} />
                </ActionForm>
              )}
            </PlanCard>
          ))}
        </ul>
        {isAdmin && (
          <details className="disclosure">
            <summary>Nova versão de plano (rascunho)</summary>
            <ActionForm action={createPlanVersionAction} submit="Criar rascunho">
              <p className="zro-mute">Plano publicado não muda: quem já assinou fica na versão que recebeu.</p>
              <div className="zro-form-row">
                <Field label="Código" htmlFor="pv-code" hint="Mesmo código = nova versão.">
                  <input className="zro-input" id="pv-code" name="code" required pattern="[a-z0-9-]+" defaultValue="ciclo-do-o" />
                </Field>
                <Field label="Nome" htmlFor="pv-name">
                  <input className="zro-input" id="pv-name" name="name" required defaultValue="Absolute ZRO Completo" />
                </Field>
                <Field label="Tipo" htmlFor="pv-kind">
                  <select className="zro-select" id="pv-kind" name="kind" defaultValue="bundle">
                    <option value="free">Grátis</option>
                    <option value="individual">Avulso (um app)</option>
                    <option value="bundle">Pacote</option>
                    <option value="team">Equipe</option>
                  </select>
                </Field>
              </div>
              <div className="zro-form-row">
                <Field label="Preço em centavos" htmlFor="pv-price" hint="Vazio = a definir.">
                  <input className="zro-input" id="pv-price" name="priceCents" inputMode="numeric" />
                </Field>
                <Field label="Moeda" htmlFor="pv-cur">
                  <input className="zro-input" id="pv-cur" name="currency" placeholder="BRL" />
                </Field>
                <Field label="Periodicidade" htmlFor="pv-int">
                  <select className="zro-select" id="pv-int" name="interval" defaultValue="">
                    <option value="">A definir</option>
                    <option value="month">Mensal</option>
                    <option value="year">Anual</option>
                  </select>
                </Field>
                <Field label="Carência (dias)" htmlFor="pv-grace">
                  <input className="zro-input" id="pv-grace" name="graceDays" inputMode="numeric" defaultValue="0" />
                </Field>
              </div>
              <Field label="Apps e limites (JSON)" htmlFor="pv-products" hint='[{"productId":"synquei","features":null,"limits":{"zro.ai_credits":600}}]'>
                <textarea className="zro-textarea" id="pv-products" name="products" required defaultValue="[]" />
              </Field>
              <Field label="Motivo" htmlFor="pv-reason">
                <input className="zro-input" id="pv-reason" name="reason" required />
              </Field>
            </ActionForm>
          </details>
        )}
      </Fold>
      <p className="zro-faint adm-foot">
        Trocar o plano de uma pessoa: <Link href="/admin/pessoas">Pessoas</Link> › ficha › Plano.
      </p>
    </div>
  )
}

function PlanCard({
  p,
  year,
  i,
  nameOf,
  children,
}: {
  p: Record<string, unknown>
  year?: Record<string, unknown>
  i: number
  nameOf: Map<string, string>
  children?: ReactNode
}) {
  const products = ((p.products as PlanProduct[] | null) ?? []).filter(Boolean)
  const credits = Math.max(0, ...products.map((x) => Number(x.limits?.['zro.ai_credits'] ?? 0)))
  const st = STATUS[p.status as string] ?? { label: p.status as string, tone: 'faint' as const }
  return (
    <li className="plan-card" style={{ '--i': i } as CSSProperties} title={`${p.code as string} · versão ${String(p.version)}`}>
      <div className="plan-card__top">
        <span className="plan-card__kind">{KIND[p.kind as string] ?? (p.kind as string)}</span>
        <Pill tone={st.tone}>{st.label}</Pill>
      </div>
      <strong className="plan-card__name">{p.name as string}</strong>
      <span className="plan-card__price">
        {p.kind === 'free' ? 'Grátis' : brl(p.price_cents as number | null)}
        {p.price_cents != null && <span className="zro-faint">{p.billing_interval === 'year' ? '/ano' : p.billing_interval === 'month' ? '/mês' : ''}</span>}
      </span>
      {year && year.price_cents != null && <span className="zro-faint">ou {brl(year.price_cents as number)}/ano</span>}
      <span className="app-icons" role="img" aria-label={`Apps: ${products.map((x) => nameOf.get(x.product) ?? x.product).join(', ') || 'nenhum'}`}>
        {products.map((x) => (
          <span key={x.product} className="app-icons__one" title={nameOf.get(x.product) ?? x.product}>
            <ProductMark productId={x.product} name={nameOf.get(x.product) ?? x.product} size={22} />
          </span>
        ))}
      </span>
      {credits > 0 && (
        <span className="zro-faint" title={LIMIT_LABEL['zro.ai_credits']}>
          {limitText('zro.ai_credits', credits)}
        </span>
      )}
      {children}
    </li>
  )
}
