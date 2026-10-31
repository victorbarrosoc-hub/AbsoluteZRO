import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { CSSProperties } from 'react'
import {
  listPeople,
  NOME_DO_PAPEL,
  papelNoConsole,
  parsePeopleFilter,
  PEOPLE_FLAGS,
  PEOPLE_ORDERS,
  PEOPLE_SEGMENTS,
  peopleFilterQuery,
  type PeopleSegment,
  type PersonRow,
  podeVer,
  requirePlatformAdmin,
  segmentCounts,
} from '@zro/core'
import { EmptyState, Field, ProductMark } from '@zro/ui'
import { AppIcons, Face } from '@/components/admin/parts'
import { Icon } from '@/components/icons'
import { fmtAgo, fmtBytes, fmtDate } from '@/lib/labels'
import { db, getAuth } from '@/lib/session'

export const metadata: Metadata = { title: 'Pessoas · Console', robots: { index: false, follow: false } }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

const SEG_ORDER: (PeopleSegment | null)[] = [null, 'ecossistema', 'avulso', 'gratis', 'sem-plano']

/** Plano em uma palavra para a linha (o detalhe fica na ficha). */
function planName(p: PersonRow): string {
  const plans = p.orgs.flatMap((o) => o.plans)
  if (!plans.length) return p.orgs.length ? 'Sem plano' : 'Sem organização'
  const names = [...new Set(plans.map((x) => x.planName))]
  return names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0]!
}

export default async function Pessoas({ searchParams }: Props) {
  const auth = await getAuth()
  // Layout e página renderizam em paralelo no Next: a página confere por conta própria.
  if (!auth || !podeVer(papelNoConsole(auth), 'pessoas')) notFound()
  requirePlatformAdmin(auth, ['admin', 'support'])
  const filter = parsePeopleFilter(await searchParams)
  const d = await db().asSystem('admin: pessoas', async (tx) => ({
    list: await listPeople(tx, filter),
    counts: await segmentCounts(tx),
    products: await tx`select id, name from zro.products order by step_order`,
  }))
  const { list } = d
  const qs = (change: Parameters<typeof peopleFilterQuery>[1] = {}) => {
    const s = peopleFilterQuery(filter, { page: 1, ...change })
    return s ? `/admin/pessoas?${s}` : '/admin/pessoas'
  }
  const more = !!(filter.flag || filter.order !== 'recentes' || filter.plan || filter.app)
  const filtered = !!(filter.q || filter.product || filter.plan || filter.flag || filter.app || filter.segment)
  const csv = peopleFilterQuery({ ...filter, page: 1 })

  return (
    <div className="page adm-page">
      <header className="adm-head adm-head--row">
        <div>
          <h1>Pessoas</h1>
          <p>
            {d.counts.todas.toLocaleString('pt-BR')} {d.counts.todas === 1 ? 'conta' : 'contas'} na plataforma.
          </p>
        </div>
        <a className="zro-btn zro-btn--ghost zro-btn--small" href={`/admin/pessoas/csv${csv ? `?${csv}` : ''}`} download>
          <Icon name="download" /> Planilha
        </a>
      </header>

      <nav className="seg" aria-label="Segmentos">
        {SEG_ORDER.map((k) => (
          <Link
            key={k ?? 'todas'}
            href={qs({ segment: k })}
            aria-current={filter.segment === k ? 'page' : undefined}
            title={k ? PEOPLE_SEGMENTS[k].hint : 'Todas as contas'}
          >
            {k ? PEOPLE_SEGMENTS[k].label : 'Todas'}
            <span className="seg__n">{d.counts[k ?? 'todas'].toLocaleString('pt-BR')}</span>
          </Link>
        ))}
      </nav>

      <div className="prod-filter" role="list" aria-label="Filtrar por app">
        <Link role="listitem" href={qs({ product: null })} aria-current={!filter.product ? 'true' : undefined} className="prod-filter__all">
          Todos os apps
        </Link>
        {d.products.map((p) => (
          <Link
            role="listitem"
            key={p.id as string}
            href={qs({ product: filter.product === p.id ? null : (p.id as string) })}
            aria-current={filter.product === p.id ? 'true' : undefined}
            title={`Quem já entrou no ${p.name as string}`}
          >
            <ProductMark productId={p.id as string} name={p.name as string} size={22} />
            <span>{p.name as string}</span>
          </Link>
        ))}
      </div>

      <form method="get" role="search" className="people-search" aria-label="Buscar pessoas">
        {filter.segment && <input type="hidden" name="seg" value={filter.segment} />}
        {filter.product && <input type="hidden" name="produto" value={filter.product} />}
        <label className="people-search__box">
          <span className="zro-sr-only">Buscar</span>
          <input className="zro-input" name="q" type="search" defaultValue={filter.q} placeholder="Nome ou e-mail" aria-label="Buscar" />
        </label>
        <button type="submit" className="zro-btn zro-btn--primary">
          Buscar
        </button>
        <details className="people-search__more" open={more}>
          <summary className="zro-btn">Mais filtros</summary>
          <div className="people-search__grid">
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
          </div>
        </details>
        {filtered && (
          <Link className="zro-btn zro-btn--ghost" href="/admin/pessoas">
            Limpar
          </Link>
        )}
      </form>

      <p className="zro-faint adm-count" role="status">
        {list.matched === list.total
          ? `${list.total.toLocaleString('pt-BR')} pessoas`
          : `${list.matched.toLocaleString('pt-BR')} de ${list.total.toLocaleString('pt-BR')}`}
        {filter.q ? ` para “${filter.q}”` : ''}
        {list.pages > 1 ? ` · página ${list.page} de ${list.pages}` : ''}
      </p>

      {list.rows.length ? (
        <ul className="people">
          <li className="people__head" aria-hidden="true">
            <span>Pessoa</span>
            <span>Plano</span>
            <span>Apps</span>
            <span>Arquivos</span>
            <span>Último acesso</span>
          </li>
          {list.rows.map((p, i) => (
            <li key={p.id} className="person" style={{ '--i': i } as CSSProperties}>
              <Link href={`/admin/pessoas/${p.id}`} className="person__link">
                <span className="person__who">
                  <Face name={p.name} avatarId={p.avatarId} online={p.online} />
                  <span className="person__id">
                    <span className="person__name">
                      {p.name}
                      {p.status === 'suspended' && <span className="adm-chip adm-chip--danger">Suspensa</span>}
                      {p.platformRole && <span className="adm-chip">{NOME_DO_PAPEL[p.platformRole]}</span>}
                    </span>
                    <span className="person__email">{p.email}</span>
                  </span>
                </span>
                <span className="person__plan" data-label="Plano">
                  <span className={`seg-dot seg-dot--${p.segment}`} title={PEOPLE_SEGMENTS[p.segment].label} aria-hidden="true" />
                  <span>
                    {planName(p)}
                    <span className="zro-sr-only"> · {PEOPLE_SEGMENTS[p.segment].label}</span>
                  </span>
                </span>
                <span className="person__apps" data-label="Apps">
                  <AppIcons apps={p.apps} />
                </span>
                <span
                  className="person__files"
                  data-label="Arquivos"
                  title="Arquivos que a pessoa trouxe para os projetos do HUB (manifestos do SOBEDESCE). Envios feitos só dentro de cada app ficam no banco do app."
                >
                  {p.files.count ? `${p.files.count.toLocaleString('pt-BR')} · ${fmtBytes(p.files.bytes)}` : '—'}
                </span>
                <span className="person__seen" data-label="Último acesso" title={p.lastSeenAt ? fmtDate(p.lastSeenAt) : 'Nunca entrou'}>
                  {p.online ? <strong className="person__online">Online</strong> : fmtAgo(p.lastSeenAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={filtered ? 'Ninguém com esse filtro.' : 'Ainda não tem ninguém aqui.'} />
      )}

      {list.pages > 1 && (
        <nav className="pager" aria-label="Páginas">
          {list.page > 1 ? (
            <Link className="zro-btn zro-btn--ghost" href={qs({ page: list.page - 1 })} rel="prev">
              Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="zro-faint">
            {list.page} de {list.pages}
          </span>
          {list.page < list.pages ? (
            <Link className="zro-btn zro-btn--primary" href={qs({ page: list.page + 1 })} rel="next">
              Próxima
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  )
}
