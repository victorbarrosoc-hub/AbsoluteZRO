import type { Metadata } from 'next'
import Link from 'next/link'
import { listRuns } from '@zro/core'
import { Card, EmptyState, Pill } from '@zro/ui'
import { ActionForm } from '@/components/action-form'
import { reprocessAction } from '@/lib/actions/project'
import { auditData } from '@/lib/data/hub'
import { fmtDate, RUN_LABEL, RUN_TONE } from '@/lib/labels'
import { db, requireOrgPage } from '@/lib/session'

export const metadata: Metadata = { title: 'Atividades' }
const REPROCESSABLE = ['failed', 'dead_letter', 'requires_review', 'blocked']

export default async function Atividades({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const auth = await requireOrgPage()
  const sp = await searchParams
  const status = Object.keys(RUN_LABEL).includes(sp.status ?? '') ? sp.status : undefined
  const [{ runs, actor }, audit] = await Promise.all([listRuns(db(), auth, { status }), auditData(auth)])
  const canAct = ['owner', 'admin', 'manager', 'editor'].includes(actor.role)
  return (
    <div className="page">
      <div className="page-head__text">
        <h1>Atividades</h1>
        <p>Execuções reais da fila, com tentativas e erros. Nada aqui é progresso estimado.</p>
      </div>
      <form className="zro-form-row">
        <select className="zro-select" name="status" defaultValue={status ?? ''} aria-label="Filtrar por situação">
          <option value="">Todas as situações</option>
          {Object.entries(RUN_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button className="zro-btn" type="submit" style={{ flex: '0 0 auto' }}>
          Filtrar
        </button>
      </form>
      <Card title="Execuções">
        {runs.length ? (
          <div className="zro-table-wrap">
            <table className="zro-table">
              <thead>
                <tr>
                  <th>Execução</th>
                  <th>Projeto</th>
                  <th>Situação</th>
                  <th>Erro</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id as string}>
                    <td>
                      <strong>{r.handler as string}</strong>
                      <div className="zro-faint">
                        {r.event_type as string} · {fmtDate(r.updated_at as Date)} · tentativa {String(r.attempts)}/{String(r.max_attempts)}
                      </div>
                    </td>
                    <td>{r.project_id ? <Link href={`/projetos/${r.project_id}#atividades`}>{r.project_title as string}</Link> : '—'}</td>
                    <td>
                      <Pill tone={RUN_TONE[r.status as string]}>{RUN_LABEL[r.status as string]}</Pill>
                    </td>
                    <td className="zro-faint">{(r.last_error as string) ?? '—'}</td>
                    <td>
                      {canAct && REPROCESSABLE.includes(r.status as string) ? (
                        <ActionForm action={reprocessAction} submit="Repetir" variant="ghost" className="">
                          <input type="hidden" name="runId" value={r.id as string} />
                          <input type="hidden" name="back" value="/atividades" />
                        </ActionForm>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Nenhuma execução" />
        )}
      </Card>
      <Card title="Auditoria" eyebrow={audit.full ? 'Toda a organização' : 'Só as suas ações'}>
        <ul className="list-plain">
          {audit.rows.map((a) => (
            <li key={String(a.id)} className="row row--between">
              <span>
                <code>{a.action as string}</code> <span className="zro-faint">{(a.actor_name as string) || (a.actor_kind as string)}</span>
              </span>
              <span className="zro-faint">{fmtDate(a.created_at as Date)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
