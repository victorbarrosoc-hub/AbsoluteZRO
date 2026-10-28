import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  listReleaseAccess,
  RELEASE_ACCESS_KINDS,
  RELEASE_CHANNELS,
  RELEASE_STATES,
  releaseState,
  type ReleaseAccessKind,
  type ReleaseChannel,
  type ReleaseState,
} from '@zro/billing'
import { requirePlatformAdmin } from '@zro/core'
import { Card, EmptyState, Field, Notice, Pill } from '@zro/ui'
import { ActionForm } from '@/components/action-form'
import { grantReleaseAccessAction, revokeReleaseAccessAction, setReleaseAction } from '@/lib/actions/release'
import { fmtDate, fmtDay } from '@/lib/labels'
import { db, getAuth } from '@/lib/session'

export const metadata: Metadata = { title: 'Lançamento · Administração', robots: { index: false, follow: false } }

const STATE_LABEL: Record<ReleaseState, string> = {
  development: 'Em desenvolvimento',
  internal_beta: 'Beta interno',
  private_beta: 'Beta fechado',
  public_beta: 'Beta público',
  released: 'Lançado',
  retired: 'Encerrado',
}
const CHANNEL_LABEL: Record<ReleaseChannel, string> = { web: 'Web', desktop: 'Desktop', api: 'API', download: 'Download', sso: 'Login único' }
const KIND_LABEL: Record<ReleaseAccessKind, string> = { owner: 'Proprietário', internal: 'Equipe', tester: 'Tester' }
const AUDIT: Record<string, string> = {
  'release.state_set': 'Estado definido',
  'release.state_changed': 'Estado alterado',
  'release.state_removed': 'Estado removido',
  'release.access_granted': 'Acesso concedido',
  'release.access_changed': 'Acesso renovado',
  'release.access_revoked': 'Acesso revogado',
  'release.access_removed': 'Acesso apagado',
  'release.denied': 'Entrada negada (app fechado)',
  'release.tokens_revoked': 'Sessões de app encerradas',
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/** Administração › Lançamento (ADR 0023): o que está aberto ao público e quem entra no que está fechado. */
export default async function Lancamento({ searchParams }: Props) {
  const auth = await getAuth()
  // Layout e página renderizam em paralelo no Next: a página confere por conta própria.
  if (!auth?.user.platformRole || !auth.user.emailVerified) notFound()
  requirePlatformAdmin(auth, ['admin', 'support'])
  const isAdmin = auth.user.platformRole === 'admin'
  const sp = await searchParams
  const q = (typeof sp.q === 'string' ? sp.q : '').trim().toLowerCase().slice(0, 80)
  const d = await db().asSystem('admin: lançamento', async (tx) => ({
    products: await tx`select id, name, stage from zro.products order by step_order`,
    states: await releaseState(tx, { fresh: true }),
    access: await listReleaseAccess(tx),
    people: await tx`
      select id, display_name, email from zro.users
      where status = 'active' and (${q}::text = '' or position(${q} in lower(email)) > 0 or position(${q} in lower(display_name)) > 0)
      order by display_name, email limit 200`,
    audit: await tx`
      select l.id, l.action, l.target_id, l.metadata, l.created_at, u.display_name as actor
      from zro.audit_logs l left join zro.users u on u.id = l.actor_user_id
      where l.action like 'release.%' order by l.id desc limit 50`,
  }))
  const nameOf = new Map(d.products.map((p) => [p.id as string, p.name as string]))
  const closed = d.products.filter((p) => !d.states[p.id as string]?.open)

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head__text">
          <p className="zro-eyebrow">Administração</p>
          <h1>Lançamento</h1>
          <p>O que está aberto ao público e quem entra no que ainda está fechado. Toda mudança pede motivo e fica na auditoria.</p>
        </div>
        <Link className="zro-btn zro-btn--ghost" href="/admin">
          Visão geral
        </Link>
      </div>
      {!isAdmin && <Notice title="Suporte: somente leitura">Mudar estado e conceder acesso exigem papel admin.</Notice>}
      <Notice title="Ser admin não abre app fechado">
        A lista de acesso é por conta. Quem administra a plataforma e não está nela vê "Em desenvolvimento" como todo mundo.
      </Notice>

      <Card title="Estado por produto" eyebrow="Fechado = só a lista de acesso entra · Lançado = canais marcados abertos ao público" id="estado">
        <ul className="list-plain">
          {d.products.map((p) => {
            const id = p.id as string
            const s = d.states[id]
            return (
              <li key={id} className="stack" data-produto={id}>
                <div className="row">
                  <strong>{p.name as string}</strong>
                  <Pill tone={s?.open ? 'ok' : 'faint'}>{STATE_LABEL[s?.state ?? 'development']}</Pill>
                  <span className="zro-faint">
                    {s?.updatedAt ? `atualizado em ${fmtDate(s.updatedAt)}` : 'sem registro (fechado por padrão)'}
                    {s?.note ? ` · ${s.note}` : ''}
                  </span>
                </div>
                {isAdmin && (
                  <ActionForm action={setReleaseAction} submit="Salvar" variant="ghost" className="row" inlineSubmit>
                    <input type="hidden" name="productId" value={id} />
                    <select className="zro-select" name="state" defaultValue={s?.state ?? 'development'} aria-label={`Estado de ${p.name as string}`}>
                      {RELEASE_STATES.map((st) => (
                        <option key={st} value={st}>
                          {STATE_LABEL[st]}
                        </option>
                      ))}
                    </select>
                    {RELEASE_CHANNELS.map((c) => (
                      <label key={c} className="row">
                        <input type="checkbox" name={`channel_${c}`} defaultChecked={!!s?.channels[c]} /> {CHANNEL_LABEL[c]}
                      </label>
                    ))}
                    <input className="zro-input" name="reason" placeholder="Motivo" required aria-label={`Motivo para ${p.name as string}`} />
                  </ActionForm>
                )}
              </li>
            )
          })}
        </ul>
      </Card>

      <Card title="Acesso interno" eyebrow="Contas que entram nos produtos fechados, por canal e prazo" id="acesso">
        {d.access.length ? (
          <div className="zro-table-wrap" tabIndex={0} role="region" aria-label="Tabela">
            <table className="zro-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Pessoa</th>
                  <th>Tipo</th>
                  <th>Canais</th>
                  <th>Validade</th>
                  <th>Motivo</th>
                  {isAdmin && <th>Ação</th>}
                </tr>
              </thead>
              <tbody>
                {d.access.map((a) => (
                  <tr key={`${a.productId}:${a.userId}`}>
                    <td>{nameOf.get(a.productId) ?? a.productId}</td>
                    <td>
                      <Link href={`/admin/pessoas/${a.userId}`}>{a.userName}</Link>
                      <div className="zro-faint">{a.userEmail}</div>
                    </td>
                    <td>{KIND_LABEL[a.kind]}</td>
                    <td className="zro-faint">{a.channels.map((c) => CHANNEL_LABEL[c]).join(', ')}</td>
                    <td className="zro-faint">
                      {a.active ? (
                        a.endsAt ? (
                          `até ${fmtDay(a.endsAt)}`
                        ) : (
                          'sem fim'
                        )
                      ) : (
                        <Pill tone="warn">{a.endsAt && a.endsAt <= new Date() ? 'Vencido' : 'Ainda não vale'}</Pill>
                      )}
                    </td>
                    <td className="zro-faint">{a.reason}</td>
                    {isAdmin && (
                      <td>
                        <ActionForm action={revokeReleaseAccessAction} submit="Revogar" variant="danger" className="row" inlineSubmit>
                          <input type="hidden" name="productId" value={a.productId} />
                          <input type="hidden" name="userId" value={a.userId} />
                          <input className="zro-input" name="reason" placeholder="Motivo" required aria-label={`Motivo para revogar ${a.userName}`} />
                        </ActionForm>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Ninguém autorizado ainda.">Produto fechado fica fechado para todo mundo até alguém entrar nesta lista.</EmptyState>
        )}

        {isAdmin && (
          <details className="disclosure" open={!!q}>
            <summary>Conceder acesso</summary>
            <form method="get" role="search" className="row" aria-label="Buscar pessoa">
              <input
                className="zro-input"
                name="q"
                type="search"
                defaultValue={q}
                placeholder="Nome ou e-mail para encontrar a pessoa"
                aria-label="Buscar pessoa"
              />
              <button type="submit" className="zro-btn zro-btn--ghost">
                Buscar
              </button>
            </form>
            <ActionForm action={grantReleaseAccessAction} submit="Conceder">
              <div className="zro-form-row">
                <Field label="Pessoa (da lista de contas)" htmlFor="ra-user" hint={d.people.length >= 200 ? 'Mostrando 200; use a busca.' : undefined}>
                  <select className="zro-select" id="ra-user" name="userId" required defaultValue="">
                    <option value="" disabled>
                      Escolha…
                    </option>
                    {d.people.map((u) => (
                      <option key={u.id as string} value={u.id as string}>
                        {(u.display_name as string) || (u.email as string)} · {u.email as string}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Produto" htmlFor="ra-product">
                  <select className="zro-select" id="ra-product" name="productId" required defaultValue={closed[0]?.id as string}>
                    {d.products.map((p) => (
                      <option key={p.id as string} value={p.id as string}>
                        {p.name as string} · {STATE_LABEL[d.states[p.id as string]?.state ?? 'development']}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Tipo" htmlFor="ra-kind">
                  <select className="zro-select" id="ra-kind" name="kind" defaultValue="tester">
                    {RELEASE_ACCESS_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Válido até (opcional)" htmlFor="ra-until" hint="Vazio = sem data de término.">
                  <input className="zro-input" id="ra-until" name="until" type="date" />
                </Field>
              </div>
              <fieldset className="row">
                <legend className="zro-faint">Canais</legend>
                {RELEASE_CHANNELS.map((c) => (
                  <label key={c} className="row">
                    <input type="checkbox" name={`channel_${c}`} defaultChecked /> {CHANNEL_LABEL[c]}
                  </label>
                ))}
              </fieldset>
              <Field label="Motivo" htmlFor="ra-reason">
                <input className="zro-input" id="ra-reason" name="reason" required />
              </Field>
            </ActionForm>
          </details>
        )}
      </Card>

      <Card title="Auditoria" eyebrow="Últimas 50 mudanças de lançamento e entradas negadas">
        {d.audit.length ? (
          <ul className="list-plain">
            {d.audit.map((l) => {
              const m = (l.metadata as Record<string, unknown>) ?? {}
              return (
                <li key={String(l.id)}>
                  <strong>{AUDIT[l.action as string] ?? (l.action as string)}</strong> · {nameOf.get(l.target_id as string) ?? (l.target_id as string)}
                  <div className="zro-faint">
                    {fmtDate(l.created_at as Date)}
                    {l.actor ? ` · ${l.actor as string}` : ''}
                    {typeof m.state === 'string' ? ` · ${STATE_LABEL[m.state as ReleaseState] ?? m.state}` : ''}
                    {typeof m.kind === 'string' ? ` · ${KIND_LABEL[m.kind as ReleaseAccessKind] ?? m.kind}` : ''}
                    {typeof m.reason === 'string' ? ` · ${m.reason}` : typeof m.note === 'string' && m.note ? ` · ${m.note}` : ''}
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="zro-faint">Nada registrado ainda.</p>
        )}
      </Card>
    </div>
  )
}
