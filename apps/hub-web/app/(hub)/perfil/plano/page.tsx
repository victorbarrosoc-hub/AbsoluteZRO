import type { Metadata } from 'next'
import Link from 'next/link'
import { avatarVersion } from '@zro/core'
import { EmptyState, Notice, Pill } from '@zro/ui'
import { AccountFrame } from '@/components/account-frame'
import { ActionForm } from '@/components/action-form'
import { cancelPlanRequestAction, planRequestAction } from '@/lib/actions/account'
import { priceLabel } from '@/lib/data/catalog'
import { planCenterData } from '@/lib/data/hub'
import { fmtDay } from '@/lib/labels'
import { db, requireOrgPage } from '@/lib/session'

export const metadata: Metadata = { title: 'Plano' }

const STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'accent' }> = {
  active: { label: 'Ativo', tone: 'ok' },
  trialing: { label: 'Em teste', tone: 'accent' },
  past_due: { label: 'Pagamento pendente', tone: 'warn' },
}

export default async function Plano() {
  const auth = await requireOrgPage()
  const [avatar, d] = await Promise.all([avatarVersion(db(), auth), planCenterData(auth)])
  const current = new Set(d.subscriptions.map((s) => s.plan_id as string))
  const paid = d.subscriptions.filter((s) => s.kind !== 'free')
  const upgrades = d.plans.filter((p) => !current.has(p.id as string))
  const asked = new Set(d.requests.map((r) => `${r.kind}:${r.plan ?? ''}`))
  return (
    <AccountFrame auth={auth} avatar={avatar} title="Plano">
      <p className="zro-mute account-lede">
        {d.org.name} ·{' '}
        <Link href="/assinatura" className="zro-mute">
          ver consumo e limites
        </Link>
      </p>
      {!d.canManage ? (
        <Notice title="Quem cuida da cobrança decide">Dono, administração e financeiro desta organização veem e pedem mudanças de plano.</Notice>
      ) : (
        <>
          <div className="plan-now">
            {d.subscriptions.length ? (
              d.subscriptions.map((s) => {
                const st = STATUS[s.status as string] ?? { label: s.status as string, tone: 'accent' as const }
                return (
                  <article key={s.id as string} className="plan-now__card">
                    <div className="row row--between">
                      <h2>{s.name as string}</h2>
                      <Pill tone={st.tone}>{st.label}</Pill>
                    </div>
                    <p className="zro-mute">
                      {s.current_period_end ? `Vale até ${fmtDay(s.current_period_end as Date)}` : 'Sem data de término'}
                      {s.cancel_at_period_end ? ' · termina no fim do período' : ''}
                      {s.grace_until ? ` · carência até ${fmtDay(s.grace_until as Date)}` : ''}
                    </p>
                  </article>
                )
              })
            ) : (
              <EmptyState title="Sem plano ativo">A conta e o HUB continuam abertos.</EmptyState>
            )}
          </div>

          {paid.length > 0 &&
            (asked.has('renew:') ? (
              <Pill tone="accent">Renovação pedida</Pill>
            ) : (
              <ActionForm action={planRequestAction} submit="Pedir renovação" variant="primary" inlineSubmit>
                <input type="hidden" name="kind" value="renew" />
              </ActionForm>
            ))}

          {upgrades.length > 0 && (
            <section className="stack" aria-labelledby="upgrade-title">
              <h2 id="upgrade-title" className="account__subtitle">
                Fazer upgrade
              </h2>
              <div className="plan-options">
                {upgrades.map((p) => (
                  <article key={p.id as string} className={`plan-option${p.kind === 'bundle' ? ' plan-option--featured' : ''}`}>
                    <h3>{p.name as string}</h3>
                    <p className="plan-option__price">{priceLabel(p as never)}</p>
                    <p className="zro-faint">
                      {String(p.products)} {p.products === 1 ? 'ferramenta' : 'ferramentas'}
                    </p>
                    {asked.has(`upgrade:${p.name as string}`) ? (
                      <Pill tone="accent">Pedido enviado</Pill>
                    ) : (
                      <ActionForm action={planRequestAction} submit="Pedir este plano" variant={p.kind === 'bundle' ? 'primary' : 'ghost'}>
                        <input type="hidden" name="kind" value="upgrade" />
                        <input type="hidden" name="planId" value={p.id as string} />
                      </ActionForm>
                    )}
                  </article>
                ))}
              </div>
              <p className="zro-faint" title="O pedido vai para a equipe Absolute ZRO, que libera o plano. O acesso só muda depois.">
                Pagamento online ainda fechado: a equipe libera o pedido.
              </p>
            </section>
          )}

          {d.requests.length > 0 && (
            <section className="stack" aria-labelledby="pedidos-title">
              <h2 id="pedidos-title" className="account__subtitle">
                Pedidos abertos
              </h2>
              <ul className="list-rows">
                {d.requests.map((r) => (
                  <li key={r.id as string} className="list-rows__item">
                    <span className="list-rows__main">
                      {r.kind === 'renew' ? 'Renovar' : `Upgrade para ${r.plan as string}`}
                      <span className="zro-faint"> · {fmtDay(r.created_at as Date)}</span>
                    </span>
                    <form action={cancelPlanRequestAction}>
                      <input type="hidden" name="requestId" value={r.id as string} />
                      <button className="zro-btn zro-btn--ghost zro-btn--small" type="submit">
                        Desistir
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </AccountFrame>
  )
}
