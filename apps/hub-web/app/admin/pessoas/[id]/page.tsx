import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { providerLabel } from '@zro/billing'
import { PEOPLE_SEGMENTS, personDetail, planOptions, requirePlatformAdmin } from '@zro/core'
import { Field, Notice, Pill, ProductMark } from '@zro/ui'
import { ActionForm } from '@/components/action-form'
import { AUDIT_LABEL, OrgPlan, ORIGIN_LABEL } from '@/components/admin-people'
import { Face, Fold } from '@/components/admin/parts'
import { Icon } from '@/components/icons'
import { reactivateUserAction, suspendUserAction } from '@/lib/actions/people'
import { fmtAgo, fmtBytes, fmtDate, fmtDay, limitText, ROLE_LABEL } from '@/lib/labels'
import { db, getAuth } from '@/lib/session'

export const metadata: Metadata = { title: 'Pessoa · Console', robots: { index: false, follow: false } }

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
  // Layout e página renderizam em paralelo no Next: a página confere por conta própria.
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
  const openSessions = sessions.filter((s) => !s.revokedAt && s.expiresAt.getTime() > now).length

  return (
    <div className="page adm-page">
      <Link href="/admin/pessoas" className="adm-back">
        <Icon name="arrow" /> Pessoas
      </Link>

      <header className="who">
        <Face name={p.name} avatarId={p.avatarId} online={p.online} size={88} />
        <div className="who__text">
          <h1>{p.name}</h1>
          <p className="who__email">{p.email}</p>
          <div className="row who__chips">
            {p.status !== 'active' && <Pill tone="danger">{p.status === 'suspended' ? 'Suspensa' : 'Excluída'}</Pill>}
            <span className={`adm-chip adm-chip--seg-${p.segment}`} title={PEOPLE_SEGMENTS[p.segment].hint}>
              {PEOPLE_SEGMENTS[p.segment].label}
            </span>
            {p.platformRole && <Pill tone="accent">{p.platformRole === 'admin' ? 'Admin da plataforma' : 'Suporte da plataforma'}</Pill>}
            {!p.emailVerified && <Pill tone="warn">E-mail sem confirmar</Pill>}
            {p.google && <Pill tone="neutral">Google</Pill>}
          </div>
        </div>
      </header>

      <div className="facts">
        <div className="fact">
          <span className="fact__label">Último acesso</span>
          <span className="fact__value" title={p.lastSeenAt ? fmtDate(p.lastSeenAt) : undefined}>
            {p.online ? 'Online agora' : fmtAgo(p.lastSeenAt)}
          </span>
          <span className="fact__hint">{p.lastSeenAt ? fmtDate(p.lastSeenAt) : 'nunca entrou'}</span>
        </div>
        <div className="fact">
          <span className="fact__label">Na plataforma desde</span>
          <span className="fact__value">{fmtDay(p.createdAt)}</span>
          <span className="fact__hint">{fmtAgo(p.createdAt)}</span>
        </div>
        <div
          className="fact"
          title="Arquivos que a pessoa trouxe para os projetos do HUB (manifestos do SOBEDESCE). Envios feitos só dentro de cada app ficam no banco do app."
        >
          <span className="fact__label">Arquivos no HUB</span>
          <span className="fact__value">{p.files.count ? p.files.count.toLocaleString('pt-BR') : '—'}</span>
          <span className="fact__hint">{p.files.count ? fmtBytes(p.files.bytes) : 'nenhum catalogado'}</span>
        </div>
        <div className="fact">
          <span className="fact__label">Apps</span>
          <span className="fact__value">{p.apps.length}</span>
          <span className="fact__hint">{p.apps.reduce((n, a) => n + a.logins, 0)} entradas</span>
        </div>
      </div>

      {!isAdmin && <Notice title="Só leitura">Trocar plano e suspender exige papel admin.</Notice>}

      <Fold title="Plano" meta={p.orgs.length ? `${p.orgs.length} ${p.orgs.length === 1 ? 'organização' : 'organizações'}` : 'sem organização'} open>
        {p.orgs.length ? (
          <div className="stack">
            {p.orgs.map((o) => (
              <div key={o.orgId} className="stack">
                <OrgPlan org={o} userId={p.id} plans={d.plans.active} canEdit={isAdmin} />
                <span className="zro-faint">Papel: {ROLE_LABEL[o.role] ?? o.role}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="adm-empty">Ainda não passou de Boas-vindas.</p>
        )}
      </Fold>

      <Fold title="Apps" meta={p.apps.length || 'nenhum'} open={p.apps.length > 0}>
        {p.apps.length ? (
          <ul className="app-uses">
            {p.apps.map((a) => (
              <li key={a.clientId}>
                <ProductMark productId={a.productId ?? ''} name={a.name} size={36} />
                <span className="app-uses__text">
                  <strong>{a.name}</strong>
                  <span className="zro-faint" title={`Primeira: ${fmtDate(a.firstLoginAt)} · última: ${fmtDate(a.lastLoginAt)}`}>
                    {a.logins} {a.logins === 1 ? 'entrada' : 'entradas'} · {fmtAgo(a.lastLoginAt)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="adm-empty">Ainda não entrou em nenhum app.</p>
        )}
      </Fold>

      <Fold title="O que pode usar" meta={entitlements.length || 'nada'}>
        {entitlements.length ? (
          <ul className="app-uses">
            {entitlements.map((e) => {
              const limits = Object.entries(e.limits)
              return (
                <li key={e.id}>
                  <ProductMark productId={e.productId} name={e.productName} size={36} />
                  <span className="app-uses__text">
                    <strong>{e.productName}</strong>
                    <span className="zro-faint">
                      {ORIGIN_LABEL[e.source] ?? e.source}
                      {e.endsAt ? ` · até ${fmtDay(e.endsAt)}` : ''}
                      {limits.length ? ` · ${limits.map(([k, v]) => limitText(k, v)).join(' · ')}` : ''}
                      {e.reason && e.source === 'admin_grant' ? ` · ${e.reason}` : ''}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="adm-empty">Nenhum app liberado agora.</p>
        )}
      </Fold>

      <Fold title="Assinaturas" meta={subscriptions.length || 'nenhuma'}>
        {subscriptions.length ? (
          <ul className="adm-rows">
            {subscriptions.map((s) => (
              <li key={s.subscriptionId}>
                <span>
                  <strong>{s.planName}</strong> <span className="zro-faint">· {s.orgName}</span>
                </span>
                <span className="zro-faint">
                  {providerLabel(s.provider)} · {SUB_STATUS[s.status] ?? s.status} · desde {fmtDay(s.createdAt)}
                  {s.periodEnd ? ` · até ${fmtDay(s.periodEnd)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="adm-empty">Nenhuma assinatura.</p>
        )}
      </Fold>

      <Fold title="Aparelhos e login" meta={`${openSessions} ${openSessions === 1 ? 'sessão aberta' : 'sessões abertas'}`}>
        <ul className="adm-rows">
          {sessions.map((s) => {
            const open = !s.revokedAt && s.expiresAt.getTime() > now
            return (
              <li key={s.id}>
                <span>
                  {device(s.userAgent)} {open ? <Pill tone="ok">Aberta</Pill> : <Pill tone="faint">Encerrada</Pill>}
                </span>
                <span className="zro-faint" title={`Entrou ${fmtDate(s.createdAt)}`}>
                  usada {fmtAgo(s.lastUsedAt)}
                </span>
              </li>
            )
          })}
          <li>
            <span>
              <strong>Absolute ZRO</strong> <span className="zro-faint">· {p.email}</span>
            </span>
            <span className="zro-faint">senha</span>
          </li>
          {identities.map((i) => (
            <li key={`${i.provider}-${i.email}`}>
              <span>
                <strong>{i.provider === 'google' ? 'Google' : i.provider}</strong> <span className="zro-faint">· {i.email}</span>
              </span>
              <span className="zro-faint" title={`Ligado ${fmtDate(i.createdAt)}`}>
                {fmtAgo(i.lastLoginAt)}
              </span>
            </li>
          ))}
        </ul>
      </Fold>

      <Fold title="Histórico" meta={timeline.length ? `${timeline.length} eventos` : 'vazio'}>
        {timeline.length ? (
          <ol className="timeline">
            {timeline.map((t) => (
              <li key={t.id} className="timeline__item">
                <span className="timeline__when zro-faint" title={fmtDate(t.createdAt)}>
                  {fmtAgo(t.createdAt)}
                </span>
                <span>
                  <strong title={t.action}>{AUDIT_LABEL[t.action] ?? 'Outra ação'}</strong>
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
          <p className="adm-empty">Nada registrado ainda.</p>
        )}
      </Fold>

      {isAdmin && (
        <Fold
          title={p.status === 'suspended' ? 'Reativar conta' : 'Suspender conta'}
          tone={p.status === 'active' && !self && !p.platformRole ? 'danger' : undefined}
        >
          {p.status === 'suspended' ? (
            <ActionForm action={reactivateUserAction} submit="Reativar conta" variant="primary">
              <p className="zro-mute">A pessoa volta a entrar com a senha ou o Google.</p>
              <input type="hidden" name="userId" value={p.id} />
              <Field label="Motivo" htmlFor="ra-reason" hint="Fica no histórico.">
                <input className="zro-input" id="ra-reason" name="reason" required maxLength={200} />
              </Field>
            </ActionForm>
          ) : self ? (
            <p className="adm-empty">Esta é a sua conta: não dá para suspender a si mesmo.</p>
          ) : p.platformRole ? (
            <p className="adm-empty">Conta da administração da plataforma: não pode ser suspensa aqui.</p>
          ) : p.status === 'active' ? (
            <ActionForm action={suspendUserAction} submit="Suspender e encerrar acessos" variant="danger">
              <p className="zro-mute">A pessoa sai do HUB e dos apps agora. Os dados ficam guardados e dá para reativar.</p>
              <input type="hidden" name="userId" value={p.id} />
              <Field label="Motivo" htmlFor="su-reason" hint="Fica no histórico.">
                <input className="zro-input" id="su-reason" name="reason" required maxLength={200} />
              </Field>
              <label className="switch-row">
                <input type="checkbox" className="switch" name="confirm" required /> Entendi: {p.name} sai agora de tudo.
              </label>
            </ActionForm>
          ) : null}
        </Fold>
      )}

      <details className="disclosure adm-tech">
        <summary>Detalhes técnicos</summary>
        <dl className="kv">
          <dt>ID da conta</dt>
          <dd className="zro-mono">{p.id}</dd>
          {p.orgs.map((o) => (
            <div key={o.orgId} className="kv__pair">
              <dt>{o.name}</dt>
              <dd className="zro-mono">{o.orgId}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  )
}
