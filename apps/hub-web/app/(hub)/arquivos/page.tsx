import type { Metadata } from 'next'
import Link from 'next/link'
import { Card, EmptyState, Pill, Stat } from '@zro/ui'
import { filesData } from '@/lib/data/hub'
import { fmtBytes, fmtDate, MANIFEST_LABEL, MANIFEST_TONE } from '@/lib/labels'
import { requireOrgPage } from '@/lib/session'

export const metadata: Metadata = { title: 'Arquivos' }

export default async function Arquivos() {
  const auth = await requireOrgPage()
  const { manifests, totals } = await filesData(auth)
  return (
    <div className="page">
      <div className="page-head__text">
        <h1>Arquivos</h1>
        <p>Manifests e localizações das cópias, de todos os projetos. O HUB não hospeda mídia: mostra onde o SOBEDESCE gravou e o que foi conferido.</p>
      </div>
      <div className="stats">
        <Card>
          <Stat label="Arquivos catalogados" value={totals.assets as number} hint={fmtBytes(Number(totals.bytes))} />
        </Card>
        <Card>
          <Stat label="Cópias conferidas" value={totals.verified as number} />
        </Card>
        <Card>
          <Stat label="Cópias sem conferência" value={totals.unverified as number} />
        </Card>
        <Card>
          <Stat label="Divergentes ou ausentes" value={totals.problems as number} />
        </Card>
      </div>
      {manifests.length ? (
        <div className="zro-table-wrap">
          <table className="zro-table">
            <thead>
              <tr>
                <th>Projeto</th>
                <th>Manifest</th>
                <th>Situação</th>
                <th>Arquivos</th>
                <th>Importado</th>
              </tr>
            </thead>
            <tbody>
              {manifests.map((m) => (
                <tr key={m.id as string}>
                  <td>
                    <Link href={`/projetos/${m.project_id}/midias`}>{m.project_title as string}</Link>
                  </td>
                  <td className="zro-mono">{m.manifest_id as string}</td>
                  <td>
                    <Pill tone={MANIFEST_TONE[m.status as string]}>{MANIFEST_LABEL[m.status as string]}</Pill>
                  </td>
                  <td>{String(m.assets)}</td>
                  <td className="zro-faint">{fmtDate(m.created_at as Date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="Nenhum manifest ainda">Os arquivos aparecem aqui depois da primeira descarga importada do SOBEDESCE.</EmptyState>
      )}
    </div>
  )
}
