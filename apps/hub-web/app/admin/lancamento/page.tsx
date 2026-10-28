import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { CSSProperties } from 'react'
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
import { EmptyState, Field, Notice, ProductMark } from '@zro/ui'
import { ActionForm } from '@/components/action-form'
import { Fold } from '@/components/admin/parts'
import { grantReleaseAccessAction, revokeReleaseAccessAction, setReleaseAction } from '@/lib/actions/release'
import { fmtAgo, fmtDate, fmtDay } from '@/lib/labels'
import { db, getAuth } from '@/lib/session'

export const metadata: Metadata = { title: 'Lançamento · Console', robots: { index: false, follow: false } }

const STATE_LABEL: Record<ReleaseState, string> = {
  development: 'Em desenvolvimento',
  internal_beta: 'Beta interno',
  private_beta: 'Beta fechado',
  public_beta: 'Beta público',
  released: 'Lançado',
  retired: 'Encerrado',
}
const CHANNEL_LABEL: Record<ReleaseChannel, string> = { web: 'Web', desktop: 'Computador', api: 'API', download: 'Download', sso: 'Login único' }
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

/** Console › Lançamento (ADR 0023): o que está aberto ao público e quem entra no que está fechado. */
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
  const openCount = d.products.length - closed.length

  return (
    <div className="page adm-page">
      <header className="adm-head">
        <h1>Lançamento</h1>
        <p>
          {openCount} {openCount === 1 ? 'app aberto' : 'apps abertos'} ao público · {closed.length} {closed.length === 1 ? 'fechado' : 'fechados'}.
        </p>
      </header>
      {!isAdmin && <Notice title="Só leitura">Mudar estado e conceder acesso exige papel admin.</Notice>}
      <p className="adm-hint" title="A lista de acesso é por conta. Quem administra a plataforma e não está nela vê 'Em desenvolvimento' como todo mundo.">
        Ser admin não abre app fechado: só a lista de acesso entra.
      </p>

      <ul className="rel-cards" id="estado">
        {d.products.map((p, i) => {
          const id = p.id as string
          const s = d.states[id]
          const state = s?.state ?? 'development'
          return (
            <li key={id} className={`rel-card${s?.open ? ' rel-card--open' : ''}`} data-produto={id} style={{ '--i': i } as CSSProperties}>
              <div className="rel-card__head">
                <ProductMark productId={id} name={p.name as string} size={44} />
                <div className="rel-card__who">
                  <strong>{p.name as string}</strong>
                  <span className={`rel-state rel-state--${state}`}>{STATE_LABEL[state]}</span>
                </div>
              </div>
              <ul className="rel-channels" aria-label={`Canais de ${p.name as string}`}>
                {RELEASE_CHANNELS.map((c) => (
                  <li key={c} className={s?.channels[c] ? 'is-on' : ''}>
                    <span className="rel-channels__dot" aria-hidden="true" />
                    {CHANNEL_LABEL[c]}
                    <span className="zro-sr-only">{s?.channels[c] ? ': marcado' : ': desmarcado'}</span>
                  </li>
                ))}
              </ul>
              <p
                className="zro-faint rel-card__when"
                title={[s?.updatedAt ? fmtDate(s.updatedAt) : '', s?.note ?? ''].filter(Boolean).join(' · ') || undefined}
              >
                {s?.updatedAt ? `Mudou ${fmtAgo(s.updatedAt)}` : 'Sem registro: fechado por padrão'}
                {s?.note ? ` · ${s.note}` : ''}
              </p>
              {isAdmin && (
                <details className="adm-confirm rel-card__edit">
                  <summary className="zro-btn zro-btn--small">Mudar…</summary>
                  <ActionForm action={setReleaseAction} submit="Salvar" variant="primary" className="stack">
                    <input type="hidden" name="productId" value={id} />
                    <fieldset className="rel-states">
                      <legend className="zro-faint">Estado</legend>
                      {RELEASE_STATES.map((st) => (
                        <label key={st}>
                          <input type="radio" name="state" value={st} defaultChecked={st === state} required />
                          <span>{STATE_LABEL[st]}</span>
                        </label>
                      ))}
                    </fieldset>
                    <fieldset className="stack">
                      <legend className="zro-faint">Canais abertos quando lançado</legend>
                      {RELEASE_CHANNELS.map((c) => (
                        <label key={c} className="switch-row">
                          <input type="checkbox" className="switch" name={`channel_${c}`} defaultChecked={!!s?.channels[c]} /> {CHANNEL_LABEL[c]}
                        </label>
                      ))}
                    </fieldset>
                    <input className="zro-input" name="reason" placeholder="Motivo" required aria-label={`Motivo para ${p.name as string}`} />
                  </ActionForm>
                </details>
              )}
            </li>
          )
        })}
      </ul>

      <Fold id="acesso" title="Quem entra nos fechados" meta={d.access.length || 'ninguém'} open={d.access.length > 0 || !!q}>
        {d.access.length ? (
          <ul className="adm-rows">
            {d.access.map((a) => (
              <li key={`${a.productId}:${a.userId}`} className="adm-rows__wide">
                <span className="row">
                  <ProductMark productId={a.productId} name={nameOf.get(a.productId) ?? a.productId} size={22} />
                  <span>
                    <Link href={`/admin/pessoas/${a.userId}`}>{a.userName}</Link>
                    <span className="zro-faint">
                      {' '}
                      · {nameOf.get(a.productId) ?? a.productId} · {KIND_LABEL[a.kind]}
                      {a.active ? (a.endsAt ? ` · até ${fmtDay(a.endsAt)}` : '') : a.endsAt && a.endsAt <= new Date() ? ' · vencido' : ' · ainda não vale'}
                    </span>
                  </span>
                </span>
                <span className="row">
                  <span className="zro-faint" title={`${a.channels.map((c) => CHANNEL_LABEL[c]).join(', ')} · ${a.reason}`}>
                    {a.channels.length} {a.channels.length === 1 ? 'canal' : 'canais'}
                  </span>
                  {isAdmin && (
                    <details className="adm-confirm">
                      <summary className="zro-btn zro-btn--small">Revogar…</summary>
                      <ActionForm action={revokeReleaseAccessAction} submit="Revogar e encerrar sessões" variant="danger" className="row" inlineSubmit>
                        <input type="hidden" name="productId" value={a.productId} />
                        <input type="hidden" name="userId" value={a.userId} />
                        <input className="zro-input" name="reason" placeholder="Motivo" required aria-label={`Motivo para revogar ${a.userName}`} />
                      </ActionForm>
                    </details>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Ninguém autorizado ainda.">App fechado fica fechado para todo mundo até alguém entrar nesta lista.</EmptyState>
        )}

        {isAdmin && (
          <details className="disclosure" open={!!q}>
            <summary>Dar acesso a alguém</summary>
            <form method="get" role="search" className="row" aria-label="Buscar pessoa">
              <input className="zro-input" name="q" type="search" defaultValue={q} placeholder="Nome ou e-mail" aria-label="Buscar pessoa" />
              <button type="submit" className="zro-btn zro-btn--ghost">
                Buscar
              </button>
            </form>
            <ActionForm action={grantReleaseAccessAction} submit="Dar acesso">
              <div className="zro-form-row">
                <Field label="Pessoa" htmlFor="ra-user" hint={d.people.length >= 200 ? 'Mostrando 200; use a busca.' : undefined}>
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
                <Field label="App" htmlFor="ra-product">
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
                <Field label="Até (opcional)" htmlFor="ra-until" hint="Vazio = sem fim.">
                  <input className="zro-input" id="ra-until" name="until" type="date" />
                </Field>
              </div>
              <fieldset className="stack">
                <legend className="zro-faint">Canais</legend>
                {RELEASE_CHANNELS.map((c) => (
                  <label key={c} className="switch-row">
                    <input type="checkbox" className="switch" name={`channel_${c}`} defaultChecked /> {CHANNEL_LABEL[c]}
                  </label>
                ))}
              </fieldset>
              <Field label="Motivo" htmlFor="ra-reason">
                <input className="zro-input" id="ra-reason" name="reason" required />
              </Field>
            </ActionForm>
          </details>
        )}
      </Fold>

      <Fold title="Histórico" meta={d.audit.length ? `${d.audit.length} mudanças` : 'vazio'}>
        {d.audit.length ? (
          <ul className="adm-rows">
            {d.audit.map((l) => {
              const m = (l.metadata as Record<string, unknown>) ?? {}
              return (
                <li key={String(l.id)}>
                  <span>
                    <strong>{AUDIT[l.action as string] ?? 'Outra mudança'}</strong> · {nameOf.get(l.target_id as string) ?? 'app'}
                    <span className="zro-faint">
                      {typeof m.state === 'string' ? ` · ${STATE_LABEL[m.state as ReleaseState] ?? m.state}` : ''}
                      {typeof m.kind === 'string' ? ` · ${KIND_LABEL[m.kind as ReleaseAccessKind] ?? m.kind}` : ''}
                      {typeof m.reason === 'string' ? ` · ${m.reason}` : typeof m.note === 'string' && m.note ? ` · ${m.note}` : ''}
                    </span>
                  </span>
                  <span className="zro-faint" title={fmtDate(l.created_at as Date)}>
                    {l.actor ? `${l.actor as string} · ` : ''}
                    {fmtAgo(l.created_at as Date)}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="adm-empty">Nada registrado ainda.</p>
        )}
      </Fold>
    </div>
  )
}
