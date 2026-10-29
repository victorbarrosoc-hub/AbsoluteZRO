import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { isDomainError } from '@zro/observability'
import { EmptyState, Pill } from '@zro/ui'
import { projectAssets } from '@/lib/data/hub'
import { fmtBytes } from '@/lib/labels'
import { requireOrgPage } from '@/lib/session'

export const metadata: Metadata = { title: 'Arquivos do projeto' }

const LOC: Record<string, { label: string; tone: 'ok' | 'warn' | 'danger' }> = {
  verified: { label: 'conferido', tone: 'ok' },
  unverified: { label: 'sem conferência', tone: 'warn' },
  mismatch: { label: 'divergente', tone: 'danger' },
  missing: { label: 'ausente', tone: 'danger' },
  failed: { label: 'falhou', tone: 'danger' },
}

export default async function Midias({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireOrgPage()
  let rows: Awaited<ReturnType<typeof projectAssets>>
  try {
    rows = await projectAssets(auth, id)
  } catch (e) {
    if (isDomainError(e) && e.code === 'project_not_found') notFound()
    throw e
  }
  return (
    <div className="page">
      <div className="page-head__text">
        <Link href={`/projetos/${id}#midias`}>← Voltar ao projeto</Link>
        <h1>Arquivos do projeto</h1>
        <p>Onde cada arquivo está, segundo o SOBEDESCE. O HUB não guarda a mídia. Caminhos são relativos à pasta do projeto no destino.</p>
      </div>
      {rows.length ? (
        <div className="zro-table-wrap" tabIndex={0} role="region" aria-label="Tabela">
          <table className="zro-table">
            <thead>
              <tr>
                <th>Arquivo</th>
                <th>Tamanho</th>
                <th>Câmera / cartão</th>
                <th>Destinos</th>
                <th>ID do ativo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id as string}>
                  <td>
                    <strong>{a.original_name as string}</strong>
                    <div className="zro-faint zro-mono">{a.relative_path as string}</div>
                  </td>
                  <td>{fmtBytes(Number(a.size_bytes))}</td>
                  <td className="zro-faint">
                    {(a.camera as string) || '—'} · {(a.card as string) || '—'}
                  </td>
                  <td>
                    <ul className="list-plain">
                      {(a.locations as { label: string; status: string; checksum: string | null }[]).map((l) => (
                        <li key={l.label}>
                          {l.label} <Pill tone={LOC[l.status]?.tone}>{LOC[l.status]?.label ?? l.status}</Pill>
                          {l.checksum && <div className="zro-faint zro-mono">{l.checksum}</div>}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="zro-mono zro-faint">{a.asset_key as string}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="Nenhum arquivo importado">Importe uma descarga do SOBEDESCE na seção Mídias e backups.</EmptyState>
      )}
    </div>
  )
}
