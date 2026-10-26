import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  listPeople,
  NO_PLAN,
  parsePeopleFilter,
  PEOPLE_FLAGS,
  PEOPLE_ORDERS,
  peopleFilterQuery,
  peopleSummary,
  planOptions,
  requirePlatformAdmin,
} from '@zro/core'
import { Card, EmptyState, Field, Notice, Pill, Stat } from '@zro/ui'
import { Chart30, Funnel, OrgPlan } from '@/components/admin-people'
import { Icon } from '@/components/icons'
import { fmtDate, fmtDay } from '@/lib/labels'
import { db, getAuth } from '@/lib/session'

export const metadata: Metadata = { title: 'Pessoas · Administração', robots: { index: false, follow: false } }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function Pessoas({ searchParams }: Props) {
  const auth = await getAuth()
  // Layout e página renderizam em paralelo no Next: a página confere por conta própria.
  if (!auth?.user.platformRole || !auth.user.emailVerified) notFound()
  requirePlatformAdmin(auth, ['admin', 'support'])
  const isAdmin = auth.user.platformRole === 'admin'
  const filter = parsePeopleFilter(await searchParams)
  const d = await db().asSystem('admin: painel de pessoas', async (tx) => ({
    summary: await peopleSummary(tx),
    list: await listPeople(tx, filter),
    plans: await planOptions(tx),
  }))
  const { summary: s, list } = d
  const qs = peopleFilterQuery(filter)
  const filtered = !!(filter.q || filter.app || filter.plan || filter.flag)

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head__text">
          <p className="zro-eyebrow">Administração</p>
          <h1>Pessoas</h1>
          <p>Quem entrou, em que plano está cada organização e quais apps cada pessoa usa.</p>
        </div>
      </div>
      {!isAdmin && <Notice title="Suporte: somente leitura">Trocar plano e suspender conta exigem papel admin.</Notice>}

      <div className="stats">
        <Stat label="Contas" value={s.accounts} hint={`${s.suspended} suspensa(s)`} />
        <Stat label="Novas em 7 dias" value={s.new7} hint={`${s.new30} em 30 dias`} />
        <Stat label="Ativas em 7 dias" value={s.active7} hint="Entrou no HUB ou num app" />
        <Stat label="Com Google" value={s.google} hint={`${s.noOrg} sem organização`} />
      </div>

      <div className="grid grid--2">
        <Card title="Últimos 30 dias" eyebrow="Cadastros e entradas em apps">
          <Chart30 series={s.series} />
        </Card>
        <Card title="Do cadastro ao uso" eyebrow="Quantas contas chegaram em cada passo">
          <Funnel steps={s.funnel} />
        </Card>
      </div>

      <Card title="Contas por app" eyebrow="Login único">
        {s.apps.length ? (
          <div className="zro-table-wrap" tabIndex={0} role="region" aria-label="Tabela">
            <table className="zro-table">
              <thead>
                <tr>
                  <th>App</th>
                  <th>Contas</th>
                  <th>Novas em 30 dias</th>
                  <th>Ativas em 7 dias</th>
                </tr>
              </thead>
              <tbody>
                {s.apps.map((a) => (
                  <tr key={a.clientId}>
                    <td>
                      <Link href={`/admin/pessoas?${peopleFilterQuery(filter, { app: a.clientId })}`}>{a.name}</Link>
                    </td>
                    <td>{a.accounts}</td>
                    <td>{a.new30}</td>
                    <td>{a.active7}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="zro-mute">Nenhum app cadastrado no login único.</p>
        )}
      </Card>

      <section className="stack" aria-labelledby="lista-pessoas">
        <h2 id="lista-pessoas">Lista de pessoas</h2>
        <form method="get" role="search" className="people-filters" aria-label="Buscar e filtrar pessoas">
          <Field label="Buscar" htmlFor="pf-q">
            <input className="zro-input" id="pf-q" name="q" type="search" defaultValue={filter.q} placeholder="Nome ou e-mail" />
          </Field>
          <Field label="App usado" htmlFor="pf-app">
            <select className="zro-select" id="pf-app" name="app" defaultValue={filter.app ?? ''}>
              <option value="">Todos</option>
              {s.apps.map((a) => (
                <option key={a.clientId} value={a.clientId}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Plano" htmlFor="pf-plan">
            <select className="zro-select" id="pf-plan" name="plano" defaultValue={filter.plan ?? ''}>
              <option value="">Todos</option>
              {d.plans.codes.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
              <option value={NO_PLAN}>Sem plano</option>
            </select>
          </Field>
          <Field label="Mostrar" htmlFor="pf-f">
            <select className="zro-select" id="pf-f" name="f" defaultValue={filter.flag ?? ''}>
              <option value="">Todas</option>
              {Object.entries(PEOPLE_FLAGS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ordem" htmlFor="pf-o">
            <select className="zro-select" id="pf-o" name="o" defaultValue={filter.order}>
              {Object.entries(PEOPLE_ORDERS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <div className="row people-filters__actions">
            <button type="submit" className="zro-btn zro-btn--primary">
              Filtrar
            </button>
            {filtered && (
              <Link className="zro-btn zro-btn--ghost" href="/admin/pessoas">
                Limpar
              </Link>
            )}
            <a className="zro-btn zro-btn--ghost" href={`/admin/pessoas/csv${qs ? `?${qs}` : ''}`} download>
              <Icon name="download" /> CSV
            </a>
          </div>
        </form>
        <p className="zro-faint" role="status">
          {list.rows.length} de {list.total} contas{filter.q ? ` para “${filter.q}”` : ''}
          {list.rows.length >= 500 ? ' (mostrando as 500 primeiras; use a busca)' : ''}
        </p>

        {list.rows.length ? (
          <ul className="people-list">
            {list.rows.map((p) => (
              <li key={p.id} className="person-row">
                <div className="person-row__head">
                  <div className="person-row__who">
                    <Link className="person-row__name" href={`/admin/pessoas/${p.id}`}>
                      {p.name}
                    </Link>
                    <span className="zro-mute person-row__email">{p.email}</span>
                  </div>
                  <div className="row person-row__tags">
                    {p.status === 'suspended' && <Pill tone="danger">Suspensa</Pill>}
                    {p.platformRole && <Pill tone="accent">{p.platformRole === 'admin' ? 'Admin' : 'Suporte'}</Pill>}
                    {p.google && <Pill tone="neutral">Google</Pill>}
                    {!p.emailVerified && <Pill tone="warn">E-mail sem confirmar</Pill>}
                  </div>
                </div>
                <dl className="person-row__facts">
                  <div>
                    <dt>Último acesso ao HUB</dt>
                    <dd>{p.hubLastSeenAt ? fmtDate(p.hubLastSeenAt) : 'nunca'}</dd>
                  </div>
                  <div>
                    <dt>Conta criada</dt>
                    <dd>{fmtDay(p.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Apps</dt>
                    <dd>
                      {p.apps.length
                        ? p.apps.map((a, i) => (
                            <span key={a.clientId}>
                              {i > 0 && ' · '}
                              {a.name} <span className="zro-faint">({fmtDate(a.lastLoginAt)})</span>
                            </span>
                          ))
                        : 'nenhum ainda'}
                    </dd>
                  </div>
                </dl>
                {p.orgs.length ? (
                  <div className="stack person-row__orgs">
                    {p.orgs.map((o) => (
                      <OrgPlan key={o.orgId} org={o} userId={p.id} plans={d.plans.active} canEdit={isAdmin} />
                    ))}
                  </div>
                ) : (
                  <p className="zro-faint">Sem organização: ainda não passou de Boas-vindas.</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={filtered ? 'Ninguém com esse filtro.' : 'Ainda não tem ninguém aqui.'} />
        )}
      </section>
    </div>
  )
}
