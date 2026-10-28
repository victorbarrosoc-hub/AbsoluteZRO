/**
 * Peças do painel de pessoas (/admin/pessoas): gráfico de 30 dias, funil, plano por organização e selos.
 * Sem JavaScript no navegador, exceto os formulários (ActionForm). Gráfico estático em SVG: nada anima.
 */
import { providerLabel } from '@zro/billing'
import type { PersonOrg, PersonPlan } from '@zro/core'
import { Pill } from '@zro/ui'
import { ActionForm } from '@/components/action-form'
import { changeOrgPlanAction } from '@/lib/actions/people'

const dayShort = (day: string) => `${Number(day.slice(8, 10))}/${Number(day.slice(5, 7))}`

/** Barras dos últimos 30 dias: cadastros e entradas em apps (um código do login único = uma entrada). */
export function Chart30({ series }: { series: { day: string; signups: number; appLogins: number }[] }) {
  const max = Math.max(1, ...series.map((s) => Math.max(s.signups, s.appLogins)))
  const signups = series.reduce((n, s) => n + s.signups, 0)
  const logins = series.reduce((n, s) => n + s.appLogins, 0)
  const H = 100
  const W = 10
  return (
    <figure className="chart30">
      <svg
        className="chart30__svg"
        viewBox={`0 0 ${series.length * W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Últimos 30 dias: ${signups} cadastros e ${logins} entradas em apps. Pico de ${max} num dia.`}
      >
        {series.map((s, i) => {
          const hs = (s.signups / max) * (H - 2)
          const ha = (s.appLogins / max) * (H - 2)
          return (
            <g key={s.day}>
              <title>{`${dayShort(s.day)}: ${s.signups} ${s.signups === 1 ? 'cadastro' : 'cadastros'} · ${s.appLogins} ${s.appLogins === 1 ? 'entrada' : 'entradas'} em apps`}</title>
              <rect x={i * W} y={0} width={W} height={H} className="chart30__hit" />
              <rect
                x={i * W + 1}
                y={H - Math.max(hs, 1)}
                width={3.6}
                height={Math.max(hs, 1)}
                rx={0.8}
                className={s.signups ? 'chart30__a' : 'chart30__zero'}
              />
              <rect
                x={i * W + 5.2}
                y={H - Math.max(ha, 1)}
                width={3.6}
                height={Math.max(ha, 1)}
                rx={0.8}
                className={s.appLogins ? 'chart30__b' : 'chart30__zero'}
              />
            </g>
          )
        })}
      </svg>
      <figcaption className="chart30__foot">
        <span>{series[0] ? dayShort(series[0].day) : ''}</span>
        <span className="chart30__legend">
          <span className="chart30__key chart30__key--a" aria-hidden /> Cadastros ({signups})
          <span className="chart30__key chart30__key--b" aria-hidden /> Entradas em apps ({logins})
        </span>
        <span>hoje</span>
      </figcaption>
    </figure>
  )
}

export function Funnel({ steps }: { steps: { label: string; n: number }[] }) {
  const top = Math.max(1, steps[0]?.n ?? 1)
  return (
    <ol className="funnel">
      {steps.map((s, i) => {
        const pct = Math.round((s.n / top) * 100)
        return (
          <li key={s.label} className="funnel__step">
            <div className="row row--between">
              <span className="zro-mute">
                {i + 1}. {s.label}
              </span>
              <span className="funnel__n">
                {s.n} <span className="zro-faint">({pct}%)</span>
              </span>
            </div>
            <div className="funnel__track" aria-hidden>
              <div className="funnel__bar" style={{ width: `${pct}%` }} />
            </div>
          </li>
        )
      })}
    </ol>
  )
}

const handManaged = (p: PersonPlan) => p.provider === 'manual' || p.provider === 'free'

/** Nome do plano + origem (grátis, manual ou provedor). */
export function PlanBadges({ plans }: { plans: PersonPlan[] }) {
  if (!plans.length) return <Pill tone="faint">Sem plano</Pill>
  return (
    <>
      {plans.map((p) => (
        <Pill
          key={p.subscriptionId}
          tone={handManaged(p) ? (p.kind === 'free' ? 'neutral' : 'accent') : 'ok'}
          title={`${p.planCode}@${p.version} · ${p.status}`}
        >
          {p.planName} · {handManaged(p) ? providerLabel(p.provider).toLowerCase() : `pago pelo ${providerLabel(p.provider)}`}
          {p.status !== 'active' ? ` (${p.status === 'trialing' ? 'teste' : 'em atraso'})` : ''}
        </Pill>
      ))}
    </>
  )
}

/**
 * Plano de uma organização com a troca ao lado (só admin). Assinatura de provedor externo não troca à mão.
 */
export function OrgPlan({
  org,
  userId,
  plans,
  canEdit,
}: {
  org: PersonOrg
  userId: string
  plans: { id: string; name: string; version: number }[]
  canEdit: boolean
}) {
  const external = org.plans.find((p) => !handManaged(p))
  const current = org.plans.find(handManaged)
  return (
    <div className="org-plan">
      <div className="org-plan__name">
        <strong>{org.name}</strong>
        {org.status !== 'active' && <Pill tone="danger">Suspensa</Pill>}
        <PlanBadges plans={org.plans} />
      </div>
      {canEdit &&
        (external ? (
          <p className="zro-faint org-plan__note">Pago pelo {providerLabel(external.provider)}: a troca é feita lá.</p>
        ) : (
          <ActionForm action={changeOrgPlanAction} submit="Salvar" variant="ghost" className="org-plan__form" inlineSubmit>
            <input type="hidden" name="orgId" value={org.orgId} />
            <input type="hidden" name="userId" value={userId} />
            <select className="zro-select" name="planId" defaultValue={current?.planId ?? ''} aria-label={`Plano de ${org.name}`} required>
              {!current && (
                <option value="" disabled>
                  Escolha um plano
                </option>
              )}
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (v{p.version})
                </option>
              ))}
            </select>
            <input className="zro-input" name="reason" defaultValue="Troca no painel" maxLength={200} required aria-label={`Motivo da troca em ${org.name}`} />
          </ActionForm>
        ))}
    </div>
  )
}

export const AUDIT_LABEL: Record<string, string> = {
  'account.created': 'Criou a conta',
  'account.email_verified': 'Confirmou o e-mail',
  'account.google_linked': 'Ligou o Google',
  'account.password_changed': 'Trocou a senha',
  'account.password_reset': 'Redefiniu a senha',
  'session.created': 'Entrou no HUB',
  'organization.created': 'Criou a organização',
  'member.invited': 'Convite enviado',
  'member.joined': 'Entrou na organização',
  'member.removed': 'Saiu da organização',
  'member.role_changed': 'Papel alterado',
  'member.invitation_revoked': 'Convite cancelado',
  'billing.plan_assigned': 'Plano concedido',
  'billing.plan_changed': 'Plano trocado',
  'billing.subscription_canceled': 'Assinatura encerrada',
  'billing.entitlement_granted': 'Concessão criada',
  'billing.entitlement_revoked': 'Concessão revogada',
  'user.suspended': 'Conta suspensa',
  'user.reactivated': 'Conta reativada',
  'admin.people_exported': 'Exportou a lista de pessoas',
  'project.created': 'Projeto criado',
  'project.updated': 'Projeto alterado',
  'release.denied': 'Tentou entrar num app em desenvolvimento',
  'release.state_set': 'Definiu o estado de lançamento de um app',
  'release.state_changed': 'Mudou o estado de lançamento de um app',
  'release.access_granted': 'Concedeu acesso interno a um app fechado',
  'release.access_changed': 'Renovou um acesso interno',
  'release.access_revoked': 'Revogou um acesso interno',
  'release.tokens_revoked': 'Encerrou sessões de um app fechado',
}

export const ORIGIN_LABEL: Record<string, string> = {
  subscription: 'assinatura',
  trial: 'teste',
  admin_grant: 'concessão',
}
