import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePlatformAdmin } from '@zro/core'
import { Card, Field, Notice, Pill } from '@zro/ui'
import { ActionForm } from '@/components/action-form'
import { assignPlanAction, cancelSubscriptionAction, createPlanVersionAction, grantAction, publishPlanAction, revokeGrantAction } from '@/lib/actions/admin'
import { fmtDate, fmtDay, RUN_LABEL } from '@/lib/labels'
import { db, getAuth } from '@/lib/session'

export const metadata: Metadata = { title: 'Administração' }

export default async function Admin() {
  const auth = await getAuth()
  // Layout e página renderizam em paralelo no Next: a página confere por conta própria.
  if (!auth?.user.platformRole || !auth.user.emailVerified) notFound()
  requirePlatformAdmin(auth, ['admin', 'support'])
  const isAdmin = auth!.user.platformRole === 'admin'
  const d = await db().asSystem('admin: painel', async (tx) => ({
    orgs: await tx`
      select o.id, o.name, o.slug, o.status, o.created_at,
        (select count(*)::int from zro.memberships m where m.org_id = o.id and m.status = 'active') as members,
        (select string_agg(p.code || '@' || p.version || ' (' || s.status || ')', ', ') from zro.subscriptions s join zro.plans p on p.id = s.plan_id where s.org_id = o.id and s.status in ('active', 'trialing', 'past_due')) as plans
      from zro.organizations o order by o.created_at desc limit 100`,
    subs: await tx`select s.id, s.status, s.provider, s.current_period_end, o.name as org, p.code, p.version from zro.subscriptions s join zro.organizations o on o.id = s.org_id join zro.plans p on p.id = s.plan_id where s.status in ('active', 'trialing', 'past_due') order by s.created_at desc limit 100`,
    grants:
      await tx`select e.id, e.product_id, e.limits, e.ends_at, e.reason, o.name as org from zro.entitlements e join zro.organizations o on o.id = e.org_id where e.source = 'admin_grant' and e.status = 'active' order by e.created_at desc limit 100`,
    plans:
      await tx`select p.id, p.code, p.version, p.name, p.kind, p.status, p.grace_days, p.price_cents, (select json_agg(json_build_object('product', pp.product_id, 'limits', pp.limits)) from zro.plan_products pp where pp.plan_id = p.id) as products from zro.plans p order by p.code, p.version`,
    products: await tx`select id, name, stage from zro.products order by step_order`,
    billing: await tx`select provider, provider_event_id, type, status, error, received_at from zro.billing_events order by received_at desc limit 50`,
    stuck:
      await tx`select r.id, r.handler, r.status, r.last_error, r.updated_at, o.name as org from zro.workflow_runs r join zro.organizations o on o.id = r.org_id where r.status in ('dead_letter', 'requires_review', 'failed') order by r.updated_at desc limit 50`,
  }))
  const activePlans = d.plans.filter((p) => p.status === 'active')
  return (
    <div className="page">
      <div className="page-head__text">
        <h1>Administração</h1>
        <p>Planos, concessões e saúde da fila. Toda ação pede um motivo e fica na auditoria.</p>
      </div>
      {!isAdmin && <Notice title="Suporte: somente leitura">Concessões e catálogo exigem papel admin.</Notice>}

      <Card title="Organizações">
        <div className="zro-table-wrap">
          <table className="zro-table">
            <thead>
              <tr>
                <th>Organização</th>
                <th>Pessoas</th>
                <th>Planos ativos</th>
                <th>Criada</th>
                <th>ID</th>
              </tr>
            </thead>
            <tbody>
              {d.orgs.map((o) => (
                <tr key={o.id as string}>
                  <td>
                    {o.name as string} {o.status !== 'active' && <Pill tone="danger">{o.status as string}</Pill>}
                  </td>
                  <td>{String(o.members)}</td>
                  <td className="zro-faint">{(o.plans as string) || '—'}</td>
                  <td className="zro-faint">{fmtDay(o.created_at as Date)}</td>
                  <td className="zro-mono zro-faint">{o.id as string}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {isAdmin && (
        <div className="grid grid--2">
          <Card title="Conceder plano" eyebrow="Assinatura manual">
            <ActionForm action={assignPlanAction} submit="Conceder">
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
                  {activePlans.map((p) => (
                    <option key={p.id as string} value={p.id as string}>
                      {p.name as string} (v{String(p.version)})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Válido até (opcional)" htmlFor="ap-until" hint="Vazio = sem data de término.">
                <input className="zro-input" id="ap-until" name="until" type="date" />
              </Field>
              <Field label="Motivo" htmlFor="ap-reason">
                <input className="zro-input" id="ap-reason" name="reason" required />
              </Field>
            </ActionForm>
          </Card>
          <Card title="Concessão de ferramenta e limites">
            <ActionForm action={grantAction} submit="Conceder">
              <Field label="Organização" htmlFor="g-org">
                <select className="zro-select" id="g-org" name="orgId" required>
                  {d.orgs.map((o) => (
                    <option key={o.id as string} value={o.id as string}>
                      {o.name as string}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ferramenta" htmlFor="g-prod">
                <select className="zro-select" id="g-prod" name="productId" required>
                  {d.products.map((p) => (
                    <option key={p.id as string} value={p.id as string}>
                      {p.name as string} ({p.stage as string})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Features (opcional, separadas por vírgula)" htmlFor="g-feat" hint="Vazio = todas.">
                <input className="zro-input" id="g-feat" name="features" />
              </Field>
              <Field label="Limites (JSON)" htmlFor="g-lim" hint='Ex.: {"sobedesce.manifest_imports": 100}'>
                <input className="zro-input" id="g-lim" name="limits" />
              </Field>
              <Field label="Válido até (opcional)" htmlFor="g-until">
                <input className="zro-input" id="g-until" name="until" type="date" />
              </Field>
              <Field label="Motivo" htmlFor="g-reason">
                <input className="zro-input" id="g-reason" name="reason" required />
              </Field>
            </ActionForm>
          </Card>
        </div>
      )}

      <div className="grid grid--2">
        <Card title="Assinaturas ativas">
          <ul className="list-plain">
            {d.subs.map((s) => (
              <li key={s.id as string} className="stack">
                <span>
                  <strong>{s.org as string}</strong> · {s.code as string}@{String(s.version)} · {s.status as string} · {s.provider as string} · até{' '}
                  {fmtDay(s.current_period_end as Date)}
                </span>
                {isAdmin && s.provider === 'manual' && (
                  <ActionForm action={cancelSubscriptionAction} submit="Cancelar" variant="danger" className="row" inlineSubmit>
                    <input type="hidden" name="subscriptionId" value={s.id as string} />
                    <select className="zro-select" name="when" aria-label="Quando">
                      <option value="end">no fim do período</option>
                      <option value="now">agora</option>
                    </select>
                    <input className="zro-input" name="reason" placeholder="Motivo" required aria-label="Motivo" />
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Concessões ativas">
          <ul className="list-plain">
            {d.grants.map((g) => (
              <li key={g.id as string} className="stack">
                <span>
                  <strong>{g.org as string}</strong> · {g.product_id as string} · <code>{JSON.stringify(g.limits)}</code> · {g.reason as string}
                </span>
                {isAdmin && (
                  <ActionForm action={revokeGrantAction} submit="Revogar" variant="danger" className="row" inlineSubmit>
                    <input type="hidden" name="entitlementId" value={g.id as string} />
                    <input className="zro-input" name="reason" placeholder="Motivo" required aria-label="Motivo" />
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Catálogo de planos" eyebrow="Versionado: plano publicado não muda">
        <div className="zro-table-wrap">
          <table className="zro-table">
            <thead>
              <tr>
                <th>Plano</th>
                <th>Situação</th>
                <th>Produtos e limites</th>
                <th>Carência</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {d.plans.map((p) => (
                <tr key={p.id as string}>
                  <td>
                    {p.name as string}{' '}
                    <span className="zro-faint">
                      {p.code as string}@{String(p.version)}
                    </span>
                  </td>
                  <td>
                    <Pill tone={p.status === 'active' ? 'ok' : p.status === 'draft' ? 'warn' : 'faint'}>{p.status as string}</Pill>
                  </td>
                  <td className="zro-mono zro-faint">{JSON.stringify(p.products ?? [])}</td>
                  <td>{String(p.grace_days)} dia(s)</td>
                  <td>
                    {isAdmin && p.status === 'draft' ? (
                      <ActionForm action={publishPlanAction} submit="Publicar" variant="ghost" className="row" inlineSubmit>
                        <input type="hidden" name="planId" value={p.id as string} />
                        <input className="zro-input" name="reason" placeholder="Motivo" required aria-label="Motivo" />
                      </ActionForm>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isAdmin && (
          <details className="disclosure">
            <summary>Nova versão de plano (rascunho)</summary>
            <ActionForm action={createPlanVersionAction} submit="Criar rascunho">
              <div className="zro-form-row">
                <Field label="Código" htmlFor="pv-code" hint="Mesmo código = nova versão.">
                  <input className="zro-input" id="pv-code" name="code" required pattern="[a-z0-9-]+" defaultValue="ciclo-do-o" />
                </Field>
                <Field label="Nome" htmlFor="pv-name">
                  <input className="zro-input" id="pv-name" name="name" required defaultValue="Ciclo do O" />
                </Field>
                <Field label="Tipo" htmlFor="pv-kind">
                  <select className="zro-select" id="pv-kind" name="kind" defaultValue="bundle">
                    <option value="free">Gratuito</option>
                    <option value="individual">Individual</option>
                    <option value="bundle">Pacote</option>
                    <option value="team">Equipe</option>
                  </select>
                </Field>
              </div>
              <div className="zro-form-row">
                <Field label="Preço em centavos (vazio = a definir)" htmlFor="pv-price">
                  <input className="zro-input" id="pv-price" name="priceCents" inputMode="numeric" />
                </Field>
                <Field label="Moeda" htmlFor="pv-cur">
                  <input className="zro-input" id="pv-cur" name="currency" placeholder="BRL" />
                </Field>
                <Field label="Periodicidade" htmlFor="pv-int">
                  <select className="zro-select" id="pv-int" name="interval" defaultValue="">
                    <option value="">a definir</option>
                    <option value="month">mensal</option>
                    <option value="year">anual</option>
                  </select>
                </Field>
                <Field label="Carência (dias)" htmlFor="pv-grace">
                  <input className="zro-input" id="pv-grace" name="graceDays" inputMode="numeric" defaultValue="0" />
                </Field>
              </div>
              <Field label="Produtos (JSON)" htmlFor="pv-products" hint='[{"productId":"synquei","features":null,"limits":{"synquei.organization_plans":50}}]'>
                <textarea className="zro-textarea" id="pv-products" name="products" required defaultValue="[]" />
              </Field>
              <Field label="Motivo" htmlFor="pv-reason">
                <input className="zro-input" id="pv-reason" name="reason" required />
              </Field>
            </ActionForm>
          </details>
        )}
      </Card>

      <div className="grid grid--2">
        <Card title="Eventos de cobrança" eyebrow="Reconciliação">
          <ul className="list-plain">
            {d.billing.length ? (
              d.billing.map((b) => (
                <li key={`${b.provider}-${b.provider_event_id}`}>
                  <code>{b.type as string}</code> · {b.provider as string} ·{' '}
                  <Pill tone={b.status === 'processed' ? 'ok' : b.status === 'failed' ? 'danger' : 'neutral'}>{b.status as string}</Pill>
                  <div className="zro-faint">
                    {fmtDate(b.received_at as Date)} {b.error ? `· ${b.error as string}` : ''}
                  </div>
                </li>
              ))
            ) : (
              <li className="zro-faint">Nenhum evento recebido.</li>
            )}
          </ul>
        </Card>
        <Card title="Execuções paradas" eyebrow="Dead-letter, revisão e falhas">
          <ul className="list-plain">
            {d.stuck.length ? (
              d.stuck.map((r) => (
                <li key={r.id as string}>
                  <strong>{r.org as string}</strong> · {r.handler as string} · {RUN_LABEL[r.status as string]}
                  <div className="zro-faint">{(r.last_error as string) ?? ''}</div>
                </li>
              ))
            ) : (
              <li className="zro-faint">Nada parado.</li>
            )}
          </ul>
        </Card>
      </div>
    </div>
  )
}
