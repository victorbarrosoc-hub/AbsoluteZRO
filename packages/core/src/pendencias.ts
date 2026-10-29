/**
 * O que espera uma ação da pessoa, por seção do HUB (o balão com o número no menu, como no SOBEDESCE). Só conta o
 * que a pessoa pode resolver e enxerga: projetos e execuções da organização ativa pelo papel zro_app (RLS); o console
 * só para quem é da plataforma. Seção sem nada pendente não aparece no resultado.
 */
import type { Authenticated } from '@zro/auth'
import type { Database } from '@zro/db'
import { BILLING_ROLES } from './account'
import { EDIT_ROLES, type OrgRole } from './authz'

export type Pendencias = Partial<Record<'/projetos' | '/atividades' | '/assinatura' | '/perfil' | '/equipe' | '/admin', number>>

export async function pendencias(db: Database, auth: Authenticated): Promise<Pendencias> {
  const out: Pendencias = {}
  if (!auth.user.emailVerified) out['/perfil'] = 1
  // Convites para a pessoa (por @ ou pelo e-mail dela, 0029): aceita ou recusa em Equipe.
  if (auth.user.emailVerified) {
    const [c] = await db.asUser({ userId: auth.user.id, orgId: auth.session.activeOrgId }, (tx) => tx`select count(*)::int as n from zro.meus_convites()`)
    if (c?.n) out['/equipe'] = c.n as number
  }
  const orgId = auth.session.activeOrgId
  if (orgId) {
    const [r] = await db.asUser(
      { userId: auth.user.id, orgId },
      (tx) => tx`
        select m.role,
          (select count(*)::int from zro.project_steps s join zro.projects p on p.id = s.project_id
            where s.org_id = ${orgId} and p.status <> 'archived' and s.state in ('needs_review', 'failed')) as etapas,
          (select count(*)::int from zro.workflow_runs w where w.org_id = ${orgId} and w.status in ('requires_review', 'failed', 'dead_letter', 'blocked')) as execucoes,
          (select count(*)::int from zro.subscriptions s where s.org_id = ${orgId} and s.status = 'past_due') as cobranca
        from zro.memberships m where m.org_id = ${orgId} and m.user_id = ${auth.user.id} and m.status = 'active'`,
    )
    if (r) {
      const role = r.role as OrgRole
      if (EDIT_ROLES.includes(role) && r.etapas) out['/projetos'] = r.etapas as number
      if (EDIT_ROLES.includes(role) && r.execucoes) out['/atividades'] = r.execucoes as number
      if (BILLING_ROLES.includes(role) && r.cobranca) out['/assinatura'] = r.cobranca as number
    }
  }
  if (auth.user.platformRole === 'admin' || auth.user.platformRole === 'support') {
    const [a] = await db.asSystem(
      'console: pendências',
      (tx) => tx`
        select (select count(*)::int from zro.plan_requests where status = 'open')
             + (select count(*)::int from zro.workflow_runs where status in ('dead_letter', 'requires_review'))
             + (select count(*)::int from zro.billing_events where status = 'failed' and received_at > now() - interval '7 days') as n`,
    )
    if (a?.n) out['/admin'] = a.n as number
  }
  return out
}
