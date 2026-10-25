import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getProject, type StepView } from '@zro/core'
import { adapterFor } from '@zro/integrations'
import { isDomainError } from '@zro/observability'
import { Card, EmptyState, Field, Notice, Pill, ProductMark } from '@zro/ui'
import { ActionForm } from '@/components/action-form'
import { CycleO } from '@/components/cycle-o'
import { importSobedesceAction, importTpeasyAction, previewPlanAction, reprocessAction, saveDocumentAction, updateProjectAction } from '@/lib/actions/project'
import { fmtDate, MANIFEST_LABEL, MANIFEST_TONE, PROJECT_STATUS_LABEL, RUN_LABEL, RUN_TONE, STEP_LABEL, STEP_TONE } from '@/lib/labels'
import { db, requireOrgPage } from '@/lib/session'

export const metadata: Metadata = { title: 'Projeto' }

const SECTIONS = [
  ['visao', 'Visão geral'],
  ['roteiro', 'Briefing e roteiro'],
  ['midias', 'Mídias e backups'],
  ['organizacao', 'Organização e sync'],
  ['edicao', 'Decupagem e edição'],
  ['som', 'Som'],
  ['finalizacao', 'Finalização e entregas'],
  ['atividades', 'Atividades e auditoria'],
] as const

const STEP_SECTION: Record<string, string> = {
  'carro-do-freela': 'visao',
  tpeasy: 'roteiro',
  sobedesce: 'midias',
  synquei: 'organizacao',
  'ai-edit': 'edicao',
  nossom: 'som',
  finishing: 'finalizacao',
}

const REPROCESSABLE = ['failed', 'dead_letter', 'requires_review', 'blocked']

function StepAccess({ step }: { step: StepView }) {
  if (step.access === 'contracted')
    return step.externalUrl ? (
      <a className="zro-btn zro-btn--small" href={step.externalUrl} target="_blank" rel="noopener noreferrer">
        Abrir {step.name}
      </a>
    ) : null
  if (step.access === 'available')
    return (
      <Link className="zro-btn zro-btn--small zro-btn--ghost" href="/assinatura">
        Contratar {step.name}
      </Link>
    )
  return <Pill tone="faint">Em desenvolvimento</Pill>
}

export default async function Projeto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireOrgPage()
  let data: Awaited<ReturnType<typeof getProject>>
  try {
    data = await getProject(db(), auth, id)
  } catch (e) {
    if (isDomainError(e) && e.code === 'project_not_found') notFound()
    throw e
  }
  const { project, steps, documents, manifests, runs, events } = data
  const canEdit = !!project.can_edit
  const step = (k: string) => steps.find((s) => s.stepKey === k)!
  const brief = documents.find((d) => d.kind === 'brief')
  const script = documents.find((d) => d.kind === 'script')
  const done = steps.filter((s) => s.displayState === 'done').length
  const offered = steps.filter((s) => s.displayState !== 'unavailable').length
  const planRuns = runs.filter((r) => r.handler === 'synquei.organization-plan' && r.status === 'succeeded')
  const latestPlan = (
    planRuns[0]?.result as {
      plan?: { preserved_asset_ids: number; bins: { bin: string }[]; create_folders: string[]; warnings: string[]; manifest_id: string }
    } | null
  )?.plan

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head__text">
          <p className="zro-eyebrow">
            {project.type as string} · {PROJECT_STATUS_LABEL[project.status as string] ?? (project.status as string)}
          </p>
          <h1>{project.title as string}</h1>
          <p>
            {project.client_reference ? `${project.client_reference as string} · ` : ''}criado por {(project.created_by_name as string) || '—'} em{' '}
            {fmtDate(project.created_at as Date)} · origem {project.origin as string}
          </p>
        </div>
        {canEdit ? <Pill tone="accent">Você pode editar</Pill> : <Pill>Somente leitura</Pill>}
      </div>

      <Card tone="stage" title="Ciclo do O" eyebrow="Estado real de cada etapa">
        <CycleO
          labelledBy="ciclo-projeto"
          title={project.title as string}
          subtitle={`${done} de ${offered} etapas concluídas`}
          steps={steps.map((s) => ({
            key: s.stepKey,
            name: s.name,
            role: s.roleInFlow,
            state: s.displayState,
            href: `#${STEP_SECTION[s.stepKey] ?? 'visao'}`,
          }))}
        />
        <span id="ciclo-projeto" className="zro-sr-only">
          Ciclo do O do projeto {project.title as string}
        </span>
      </Card>

      <nav className="subnav" aria-label="Seções do projeto">
        {SECTIONS.map(([k, label]) => (
          <a key={k} href={`#${k}`}>
            {label}
          </a>
        ))}
      </nav>

      <Card id="visao" title="Visão geral">
        <div className="grid">
          {steps.map((s) => {
            const a = adapterFor(s.stepKey)
            return (
              <div key={s.stepKey} className="step-card" id={`etapa-${s.stepKey}`}>
                <div className="step-card__head">
                  <span className="row">
                    <ProductMark productId={s.stepKey} name={s.name} size={28} />
                    <strong>{s.name}</strong>
                  </span>
                  <Pill tone={STEP_TONE[s.displayState]}>{STEP_LABEL[s.displayState]}</Pill>
                </div>
                <p className="zro-faint">{s.roleInFlow}</p>
                <dl className="kv">
                  <dt>Origem</dt>
                  <dd>{s.source ?? '—'}</dd>
                  <dt>Última sincronização</dt>
                  <dd>{fmtDate(s.lastSyncedAt)}</dd>
                </dl>
                {a && <p className="zro-faint">No HUB: {a.hubCan[0]}</p>}
                <StepAccess step={s} />
              </div>
            )
          })}
        </div>
        {canEdit && (
          <details className="disclosure">
            <summary>Editar dados do projeto</summary>
            <ActionForm action={updateProjectAction} submit="Salvar">
              <input type="hidden" name="projectId" value={id} />
              <div className="zro-form-row">
                <Field label="Nome" htmlFor="p-title">
                  <input className="zro-input" id="p-title" name="title" defaultValue={project.title as string} maxLength={160} />
                </Field>
                <Field label="Cliente" htmlFor="p-client">
                  <input className="zro-input" id="p-client" name="client" defaultValue={(project.client_reference as string) ?? ''} />
                </Field>
                <Field label="Status" htmlFor="p-status">
                  <select className="zro-select" id="p-status" name="status" defaultValue={project.status as string}>
                    {Object.entries(PROJECT_STATUS_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </ActionForm>
          </details>
        )}
      </Card>

      <Card id="roteiro" title="Briefing e roteiro" eyebrow="TPeasy · versões guardadas">
        <div className="grid grid--2">
          {(['brief', 'script'] as const).map((kind) => {
            const doc = kind === 'brief' ? brief : script
            return (
              <div key={kind} className="stack">
                <div className="row row--between">
                  <h3>{kind === 'brief' ? 'Briefing' : 'Roteiro'}</h3>
                  {doc ? (
                    <span className="zro-faint">
                      versão {String(doc.version)} · {doc.source as string} · {fmtDate(doc.created_at as Date)}
                    </span>
                  ) : (
                    <span className="zro-faint">sem versão</span>
                  )}
                </div>
                {canEdit ? (
                  <ActionForm action={saveDocumentAction} submit="Salvar nova versão" variant="ghost">
                    <input type="hidden" name="projectId" value={id} />
                    <input type="hidden" name="kind" value={kind} />
                    <Field label="Título" htmlFor={`${kind}-title`}>
                      <input className="zro-input" id={`${kind}-title`} name="title" defaultValue={(doc?.title as string) ?? ''} />
                    </Field>
                    <Field
                      label="Texto"
                      htmlFor={`${kind}-body`}
                      hint={kind === 'script' ? 'Marcações do TPeasy: # bloco, [pausa], **ênfase**, ((nota)).' : undefined}
                    >
                      <textarea className="zro-textarea" id={`${kind}-body`} name="body" defaultValue={(doc?.body as string) ?? ''} />
                    </Field>
                  </ActionForm>
                ) : (
                  <pre className="json">{(doc?.body as string) || 'Sem texto.'}</pre>
                )}
              </div>
            )
          })}
        </div>
        <div className="grid grid--2">
          <div className="stack">
            <h3>Levar para o TPeasy</h3>
            <p className="zro-faint">Baixa o roteiro no formato de backup do TPeasy (Ajustes › Backup › Importar). Não mexe nos ajustes do app.</p>
            {step('tpeasy').access === 'contracted' ? (
              script ? (
                <a className="zro-btn zro-btn--small" href={`/api/v1/projects/${id}/tpeasy/script`}>
                  Baixar backup do roteiro
                </a>
              ) : (
                <p className="zro-faint">Salve um roteiro primeiro.</p>
              )
            ) : (
              <StepAccess step={step('tpeasy')} />
            )}
          </div>
          {canEdit && step('tpeasy').access === 'contracted' && (
            <ActionForm action={importTpeasyAction} submit="Importar do TPeasy" variant="ghost">
              <input type="hidden" name="projectId" value={id} />
              <Field label="Backup do TPeasy (.json)" htmlFor="tp-backup">
                <input className="zro-input" id="tp-backup" name="backup" type="file" accept="application/json,.json" required />
              </Field>
              <Field label="Id do roteiro (se o backup tiver vários)" htmlFor="tp-id">
                <input className="zro-input" id="tp-id" name="scriptId" />
              </Field>
            </ActionForm>
          )}
        </div>
      </Card>

      <Card id="midias" title="Mídias e backups" eyebrow="SOBEDESCE" actions={<Link href={`/projetos/${id}/midias`}>Ver arquivos</Link>}>
        <p className="zro-mute">
          O HUB não recebe a mídia. Ele lê o resumo do cartão (<code>.sobedesce/descargas.jsonl</code>) e os relatórios <code>SOBEDESCE_copia_*.xxh64</code> de
          cada destino. Só conta como conferido o que tem checksum no relatório.
        </p>
        {manifests.length ? (
          <div className="zro-table-wrap">
            <table className="zro-table">
              <thead>
                <tr>
                  <th>Descarga</th>
                  <th>Situação</th>
                  <th>Arquivos</th>
                  <th>Cópias conferidas</th>
                  <th>Importado</th>
                </tr>
              </thead>
              <tbody>
                {manifests.map((m) => {
                  const v = m.verification as {
                    verified_locations: number
                    unverified_locations: number
                    mismatched_locations: number
                    backup_complete: boolean
                  }
                  const issues = m.issues as { level: string; message: string }[]
                  return (
                    <tr key={m.id as string}>
                      <td>
                        <code>{m.manifest_id as string}</code>
                        {issues.length > 0 && (
                          <details className="disclosure">
                            <summary>{issues.length} aviso(s)</summary>
                            <ul className="list-plain">
                              {issues.map((i, n) => (
                                <li key={n} className={i.level === 'error' ? 'zro-field__error' : 'zro-faint'}>
                                  {i.message}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </td>
                      <td>
                        <Pill tone={MANIFEST_TONE[m.status as string]}>{MANIFEST_LABEL[m.status as string]}</Pill>{' '}
                        {v.backup_complete ? <Pill tone="ok">Backup comprovado</Pill> : <Pill tone="warn">Backup não comprovado</Pill>}
                      </td>
                      <td>{String(m.assets)}</td>
                      <td>
                        {v.verified_locations} conferida(s) · {v.unverified_locations} sem conferência
                        {v.mismatched_locations ? ` · ${v.mismatched_locations} divergente(s)` : ''}
                      </td>
                      <td className="zro-faint">{fmtDate(m.created_at as Date)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Nenhuma descarga importada">Depois que o SOBEDESCE passar um cartão, importe o resumo aqui.</EmptyState>
        )}
        {canEdit && step('sobedesce').access === 'contracted' ? (
          <details className="disclosure">
            <summary>Importar descarga do SOBEDESCE</summary>
            <ActionForm action={importSobedesceAction} submit="Importar e conferir" showData>
              <input type="hidden" name="projectId" value={id} />
              <Field label="descargas.jsonl" htmlFor="sd-file" hint="Fica em <destino>/<Projeto>/.sobedesce/. Vale a última linha (o último cartão).">
                <input className="zro-input" id="sd-file" name="descargasFile" type="file" accept=".jsonl,application/x-ndjson,text/plain" />
              </Field>
              <Field label="Ou cole o conteúdo" htmlFor="sd-text">
                <textarea className="zro-textarea" id="sd-text" name="descargasText" />
              </Field>
              {[1, 2].map((i) => (
                <div key={i} className="dest-row">
                  <Field label={`Destino ${i}`} htmlFor={`d${i}-label`} hint="Ex.: HD principal, Backup">
                    <input className="zro-input" id={`d${i}-label`} name={`dest${i}Label`} />
                  </Field>
                  <Field label={`Relatórios .xxh64 do destino ${i}`} htmlFor={`d${i}-rep`} hint="Ficam na pasta do cartão. Pode enviar mais de um.">
                    <input className="zro-input" id={`d${i}-rep`} name={`dest${i}Reports`} type="file" multiple accept=".xxh64,.md5,text/plain" />
                  </Field>
                </div>
              ))}
            </ActionForm>
          </details>
        ) : (
          <StepAccess step={step('sobedesce')} />
        )}
      </Card>

      <Card id="organizacao" title="Organização e sync" eyebrow="Synquei · prévia, sem mover arquivos">
        <p className="zro-mute">
          O Synquei organiza e sincroniza pelo som no app dele. Aqui o HUB valida o manifest e mostra a prévia: pastas de trabalho, bins por diária, câmera e
          cartão, e os IDs preservados. Nada é movido, renomeado ou apagado.
        </p>
        {latestPlan ? (
          <div className="stack">
            <Notice tone="warn" title="Prévia pronta, aguardando revisão">
              {latestPlan.preserved_asset_ids} arquivo(s) com ID preservado · {latestPlan.bins.map((b) => b.bin).join(', ')}
            </Notice>
            <dl className="kv">
              <dt>Pastas de trabalho</dt>
              <dd>{latestPlan.create_folders.join(', ')}</dd>
              <dt>Manifest</dt>
              <dd>
                <code>{latestPlan.manifest_id}</code>
              </dd>
            </dl>
            {latestPlan.warnings.length > 0 && (
              <ul className="list-plain">
                {latestPlan.warnings.map((w) => (
                  <li key={w} className="zro-faint">
                    {w}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="zro-faint">Sem prévia ainda. Ela é gerada sozinha quando uma descarga conferida chega.</p>
        )}
        {step('synquei').access === 'contracted' ? (
          manifests
            .filter((m) => m.status !== 'invalid')
            .slice(0, 3)
            .map((m) => (
              <ActionForm key={m.id as string} action={previewPlanAction} submit={`Ver prévia de ${m.manifest_id as string}`} variant="ghost" showData>
                <input type="hidden" name="projectId" value={id} />
                <input type="hidden" name="manifestRowId" value={m.id as string} />
              </ActionForm>
            ))
        ) : (
          <StepAccess step={step('synquei')} />
        )}
      </Card>

      <Card id="edicao" title="Decupagem e edição" eyebrow="AI Edit · nome provisório">
        <Notice title="Em desenvolvimento">
          O AI Edit ainda não existe como ferramenta. O contrato de entrada (mídia sincronizada, briefing, roteiro) e de saída (<code>edit.selects.ready</code>,{' '}
          <code>edit.timeline.ready</code>) já está definido. Nenhuma IA roda aqui.
        </Notice>
      </Card>

      <Card id="som" title="Som" eyebrow="NOSSOM">
        <p className="zro-mute">
          O NOSSOM trata o áudio no próprio dispositivo; o áudio não passa pelo HUB. A passagem da timeline e das marcações segue o contrato
          edit.timeline.ready.
        </p>
        <StepAccess step={step('nossom')} />
      </Card>

      <Card id="finalizacao" title="Finalização e entregas" eyebrow="Revela">
        <Notice title="Em desenvolvimento">Começa pela cor no DaVinci Resolve: LUT a partir de uma referência e entrega em PowerGrade e LUT.</Notice>
      </Card>

      <Card id="atividades" title="Atividades e auditoria">
        {runs.length ? (
          <div className="zro-table-wrap">
            <table className="zro-table">
              <thead>
                <tr>
                  <th>Execução</th>
                  <th>Situação</th>
                  <th>Tentativas</th>
                  <th>Detalhe</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id as string}>
                    <td>
                      <strong>{r.handler as string}</strong>
                      <div className="zro-faint">
                        {r.event_type as string} · {fmtDate(r.created_at as Date)}
                      </div>
                    </td>
                    <td>
                      <Pill tone={RUN_TONE[r.status as string]}>{RUN_LABEL[r.status as string]}</Pill>
                    </td>
                    <td>
                      {String(r.attempts)} de {String(r.max_attempts)}
                    </td>
                    <td className="zro-faint">{(r.last_error as string) ?? '—'}</td>
                    <td>
                      {canEdit && REPROCESSABLE.includes(r.status as string) ? (
                        <ActionForm action={reprocessAction} submit="Repetir" variant="ghost" className="">
                          <input type="hidden" name="runId" value={r.id as string} />
                          <input type="hidden" name="back" value={`/projetos/${id}`} />
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
          <p className="zro-faint">Nenhuma execução neste projeto.</p>
        )}
        <details className="disclosure">
          <summary>Eventos ({events.length})</summary>
          <ul className="list-plain">
            {events.map((e) => (
              <li key={e.id as string} className="row row--between">
                <code>
                  {e.event_type as string} v{String(e.schema_version)}
                </code>
                <span className="zro-faint">
                  {e.producer as string} · {fmtDate(e.occurred_at as Date)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      </Card>
    </div>
  )
}
