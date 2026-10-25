import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { providerLabel } from '@zro/billing'
import { personDetail, planOptions, requirePlatformAdmin } from '@zro/core'
import { Card, Field, Notice, Pill } from '@zro/ui'
import { ActionForm } from '@/components/action-form'
import { AUDIT_LABEL, OrgPlan, ORIGIN_LABEL } from '@/components/admin-people'
import { reactivateUserAction, suspendUserAction } from '@/lib/actions/people'
import { fmtDate, fmtDay, ROLE_LABEL } from '@/lib/labels'
import { db, getAuth } from '@/lib/session'

export const metadata: Metadata = { title: 'Pessoa · Administração', robots: { index: false, follow: false } }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SUB_STATUS: Record<string, string> = {
  active: 'ativa',
  trialing: 'em teste',
  past_due: 'em atraso',
  canceled: 'encerrada',
  expired: 'expirada',
  incomplete: 'incompleta',
}

/** Navegador e sistema a partir do user-agent, sem mostrar o texto todo. */
function device(ua: string | null): string {
  if (!ua) return 'Aparelho desconhecido'
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador'
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : ''
  return os ? `${browser} · ${os}` : browser
}

export default async function Pessoa({ params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuth()
  if (!auth?.user.platformRole || !auth.user.emailVerified) notFound()
  requirePlatformAdmin(auth, ['admin', 'support'])
  const isAdmin = auth.user.platformRole === 'admin'
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const d = await db().asSystem('admin: página da pessoa', async (tx) => ({ detail: await personDetail(tx, id), plans: await planOptions(tx) }))
  if (!d.detail) notFound()
  const { person: p, subscriptions, entitlements, sessions, identities, timeline } = d.detail
  const self = p.id === auth.user.id
  const now = Date.now()

  return (
    <div className="page">
      <Link href="/admin/pessoas" className="zro-mute">
        ← Todas as pessoas
      </Link>
      <div className="page-head">
        <div className="page-head__text">
          <p className="zro-eyebrow">Pessoa</p>
          <h1>{p.name}</h1>
          <p>{p.email}</p>
          <div className="row">
            <Pill tone={p.status === 'active' ? 'ok' : 'danger'}>{p.status === 'active' ? 'Ativa' : p.status === 'suspended' ? 'Suspensa' : 'Excluída'}</Pill>
            {p.platformRole && <Pill tone="accent">{p.platformRole === 'admin' ? 'Admin da plataforma' : 'Suporte da plataforma'}</Pill>}
            <Pill tone={p.emailVerified ? 'neutral' : 'warn'}>{p.emailVerified ? 'E-mail confirmado' : 'E-mail sem confirmar'}</Pill>
            {p.google && <Pill tone="neutral">Google ligado</Pill>}
          </div>
        </div>
      </div>
      {!isAdmin && <Notice title="Suporte: somente leitura">Trocar plano e suspender conta exigem papel admin.</Notice>}

      <div className="grid grid--2">
        <Card title="Conta">
          <dl className="kv">
            <dt>Criada</dt>
            <dd>{fmtDate(p.createdAt)}</dd>
            <dt>Último acesso ao HUB</dt>
            <dd>{p.hubLastSeenAt ? fmtDate(p.hubLastSeenAt) : 'nunca'}</dd>
            <dt>Último acesso</dt>
            <dd>{p.lastSeenAt ? fmtDate(p.lastSeenAt) : 'nunca'}</dd>
            <dt>ID</dt>
            <dd className="zro-mono zro-faint">{p.id}</dd>
          </dl>
          {isAdmin &&
            (p.status === 'suspended' ? (
              <ActionForm action={reactivateUserAction} submit="Reativar conta" variant="ghost">
                <input type="hidden" name="userId" value={p.id} />
                <Field label="Motivo" htmlFor="ra-reason">
                  <input className="zro-input" id="ra-reason" name="reason" required maxLength={200} />
                </Field>
              </ActionForm>
            ) : self ? (
              <p className="zro-faint">Esta é a sua conta: não dá para suspender a si mesmo.</p>
            ) : p.platformRole ? (
              <p className="zro-faint">Conta da administração da plataforma: não pode ser suspensa aqui.</p>
            ) : p.status === 'active' ? (
              <details className="disclosure">
                <summary>Suspender conta</summary>
                <ActionForm action={suspendUserAction} submit="Suspender e encerrar acessos" variant="danger">
                  <p className="zro-mute">A pessoa sai do HUB e dos apps agora. Os dados ficam guardados.</p>
                  <input type="hidden" name="userId" value={p.id} />
                  <Field label="Motivo" htmlFor="su-reason">
                    <input className="zro-input" id="su-reason" name="reason" required maxLength={200} />
                  </Field>
                </ActionForm>
              </details>
            ) : null)}
        </Card>

        <Card title="Organizações e plano">
          {p.orgs.length ? (
            <div className="stack">
              {p.orgs.map((o) => (
                <div key={o.orgId} className="stack">
                  <span className="zro-faint">Papel: {ROLE_LABEL[o.role] ?? o.role}</span>
                  <OrgPlan org={o} userId={p.id} plans={d.plans.active} canEdit={isAdmin} />
                </div>
              ))}
            </div>
          ) : (
            <p className="zro-mute">Sem organização: ainda não passou de Boas-vindas.</p>
          )}
        </Card>
      </div>

      <Card title="O que pode usar agora" eyebrow="Acessos vigentes das organizações">
        {entitlements.length ? (
          <div className="zro-table-wrap">
            <table className="zro-table">
              <thead>
                <tr>
                  <th>Ferramenta</th>
                  <th>Organização</th>
                  <th>Origem</th>
                  <th>Limites</th>
                  <th>Até</th>
                </tr>
              </thead>
              <tbody>
                {entitlements.map((e) => (
                  <tr key={e.id}>
                    <td>{e.productName}</td>
                    <td>{e.orgName}</td>
                    <td>
                      {ORIGIN_LABEL[e.source] ?? e.source}
                      {e.reason && e.source === 'admin_grant' ? <div className="zro-faint">{e.reason}</div> : null}
                    </td>
                    <td className="zro-mono zro-faint">{Object.keys(e.limits).length ? JSON.stringify(e.limits) : 'sem limite configurado'}</td>
                    <td>{e.endsAt ? fmtDay(e.endsAt) : 'sem data'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="zro-mute">Nenhuma ferramenta liberada agora.</p>
        )}
      </Card>

      <div className="grid grid--2">
        <Card title="Apps">
          {p.apps.length ? (
            <ul className="list-plain">
              {p.apps.map((a) => (
                <li key={a.clientId}>
                  <strong>{a.name}</strong> · {a.logins} {a.logins === 1 ? 'entrada' : 'entradas'}
                  <div className="zro-faint">
                    Primeira: {fmtDate(a.firstLoginAt)} · última: {fmtDate(a.lastLoginAt)}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="zro-mute">Ainda não entrou em nenhum app.</p>
          )}
        </Card>
        <Card title="Assinaturas" eyebrow="Mais recentes primeiro">
          {subscriptions.length ? (
            <ul className="list-plain">
              {subscriptions.map((s) => (
                <li key={s.subscriptionId}>
                  <strong>{s.planName}</strong> v{s.version} · {s.orgName}
                  <div className="zro-faint">
                    {providerLabel(s.provider)} · {SUB_STATUS[s.status] ?? s.status} · desde {fmtDay(s.createdAt)}
                    {s.periodEnd ? ` · até ${fmtDay(s.periodEnd)}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="zro-mute">Nenhuma assinatura.</p>
          )}
        </Card>
      </div>

      <div className="grid grid--2">
        <Card title="Sessões no HUB" eyebrow="Últimas 10">
          {sessions.length ? (
            <ul className="list-plain">
              {sessions.map((s) => {
                const open = !s.revokedAt && s.expiresAt.getTime() > now
                return (
                  <li key={s.id}>
                    {device(s.userAgent)} {open ? <Pill tone="ok">Aberta</Pill> : <Pill tone="faint">Encerrada</Pill>}
                    <div className="zro-faint">
                      Entrou {fmtDate(s.createdAt)} · último uso {fmtDate(s.lastUsedAt)}
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="zro-mute">Nenhuma sessão.</p>
          )}
        </Card>
        <Card title="Identidades ligadas">
          <ul className="list-plain">
            <li>
              <strong>Absolute ZRO</strong> · {p.email}
            </li>
            {identities.map((i) => (
              <li key={`${i.provider}-${i.email}`}>
                <strong>{i.provider === 'google' ? 'Google' : i.provider}</strong> · {i.email}
                <div className="zro-faint">
                  Ligado {fmtDate(i.createdAt)} · última entrada {fmtDate(i.lastLoginAt)}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Linha do tempo" eyebrow="Últimos eventos da auditoria">
        {timeline.length ? (
          <ol className="timeline">
            {timeline.map((t) => (
              <li key={t.id} className="timeline__item">
                <span className="timeline__when zro-faint">{fmtDate(t.createdAt)}</span>
                <span>
                  <strong>{AUDIT_LABEL[t.action] ?? <code>{t.action}</code>}</strong>
                  {t.orgName ? ` · ${t.orgName}` : ''}
                  {t.actorKind === 'admin' && t.actorName
                    ? ` · por ${t.actorName} (admin)`
                    : t.actorName && t.actorName !== p.name
                      ? ` · por ${t.actorName}`
                      : ''}
                  {t.reason ? <span className="zro-faint"> · {t.reason}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="zro-mute">Nada registrado ainda.</p>
        )}
      </Card>
    </div>
  )
}
