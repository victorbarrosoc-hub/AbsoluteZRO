/**
 * Peças do console sobre pessoas: funil, plano por organização (com a troca) e rótulos em palavras.
 * Sem JavaScript no navegador, exceto os formulários (ActionForm).
 */
import type { CSSProperties } from 'react'
import { providerLabel } from '@zro/billing'
import type { PersonOrg, PersonPlan } from '@zro/core'
import { Pill } from '@zro/ui'
import { ActionForm } from '@/components/action-form'
import { changeOrgPlanAction } from '@/lib/actions/people'

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
              <div className="funnel__bar" style={{ width: `${pct}%`, '--i': i } as CSSProperties} />
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
          <details className="adm-confirm">
            <summary className="zro-btn zro-btn--small">Trocar plano…</summary>
            <ActionForm action={changeOrgPlanAction} submit="Salvar" variant="primary" className="org-plan__form" inlineSubmit>
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
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                className="zro-input"
                name="reason"
                defaultValue="Troca no painel"
                maxLength={200}
                required
                aria-label={`Motivo da troca em ${org.name}`}
              />
            </ActionForm>
          </details>
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
  'account.deleted': 'Excluiu a própria conta',
  'organization.closed': 'Organização encerrada',
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

export const BILLING_EVENT_LABEL: Record<string, string> = {
  'subscription.updated': 'Assinatura atualizada',
  'subscription.deleted': 'Assinatura encerrada',
}

export const BILLING_STATUS: Record<string, string> = { received: 'Recebido', processed: 'Processado', ignored: 'Ignorado', failed: 'Falhou' }
