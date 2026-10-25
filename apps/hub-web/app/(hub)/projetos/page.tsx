import type { Metadata } from 'next'
import Link from 'next/link'
import { listProjects } from '@zro/core'
import { EmptyState, Pill } from '@zro/ui'
import { fmtDate, PROJECT_STATUS_LABEL } from '@/lib/labels'
import { db, requireOrgPage } from '@/lib/session'

export const metadata: Metadata = { title: 'Meus projetos' }

export default async function Projetos({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const auth = await requireOrgPage()
  const sp = await searchParams
  const status = ['active', 'paused', 'delivered', 'archived'].includes(sp.status ?? '') ? sp.status : undefined
  const { projects } = await listProjects(db(), auth, { status, q: sp.q?.slice(0, 80) || undefined })
  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head__text">
          <h1>Meus projetos</h1>
          <p>Cada projeto liga as etapas do Ciclo do O: do job à entrega.</p>
        </div>
        <Link className="zro-btn zro-btn--primary" href="/projetos/novo">
          Novo projeto
        </Link>
      </div>
      <form className="zro-form-row" role="search">
        <input className="zro-input" name="q" placeholder="Buscar pelo nome" defaultValue={sp.q ?? ''} aria-label="Buscar projeto" />
        <select className="zro-select" name="status" defaultValue={status ?? ''} aria-label="Status">
          <option value="">Todos os status</option>
          {Object.entries(PROJECT_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button className="zro-btn" type="submit" style={{ flex: '0 0 auto' }}>
          Filtrar
        </button>
      </form>
      {projects.length ? (
        <div className="zro-table-wrap">
          <table className="zro-table">
            <thead>
              <tr>
                <th>Projeto</th>
                <th>Status</th>
                <th>Etapas</th>
                <th>Origem</th>
                <th>Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id as string}>
                  <td>
                    <Link href={`/projetos/${p.id}`}>
                      <strong>{p.title as string}</strong>
                    </Link>
                    {p.client_reference ? <div className="zro-faint">{p.client_reference as string}</div> : null}
                  </td>
                  <td>
                    <Pill>{PROJECT_STATUS_LABEL[p.status as string] ?? (p.status as string)}</Pill>
                  </td>
                  <td>
                    {String(p.steps_done)} concluída(s)
                    {Number(p.steps_attention) > 0 && (
                      <>
                        {' '}
                        <Pill tone="warn">{String(p.steps_attention)} pedindo atenção</Pill>
                      </>
                    )}
                  </td>
                  <td className="zro-faint">{p.origin as string}</td>
                  <td className="zro-faint">{fmtDate(p.updated_at as Date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title={sp.q || status ? 'Nenhum projeto com esse filtro' : 'Nenhum projeto ainda'}
          action={
            <Link className="zro-btn zro-btn--primary zro-btn--small" href="/projetos/novo">
              Novo projeto
            </Link>
          }
        />
      )}
    </div>
  )
}
