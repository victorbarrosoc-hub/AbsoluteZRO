// Fluxo ponta a ponta com o Ciclo do O (PRD §13 Fase 2, §14): job → roteiro → ingest → organização.
// Mídia: fixtures gerados pelo código real do SOBEDESCE (tests/fixtures/sobedesce).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'
import { createProject, findEventCycle, getProject, runOnce } from '@zro/core'
import { createLogger } from '@zro/observability'
import {
  exportScriptToTpeasy,
  HANDLER_EMITS,
  HANDLERS,
  importCarroJob,
  importScriptFromTpeasy,
  importSobedesceDelivery,
  importSobedesceManifest,
  previewOrganizationPlan,
  ROUTES,
  toTpeasyBackup,
} from '@zro/integrations'
import { allowRelease, expectCode, fixture, giveLimits, givePlan, newOrgWithOwner } from './helpers'

let db: Database
const log = createLogger('teste', () => {})
beforeAll(() => {
  db = testDatabase()
})
afterAll(() => db.close())

const destinations = () => [
  { id: 'hd-principal', label: 'HD principal', reports: [{ name: 'SOBEDESCE_copia.xxh64', text: fixture('sobedesce/unica-principal.xxh64') }] },
  { id: 'hd-backup', label: 'HD backup', reports: [{ name: 'SOBEDESCE_copia.xxh64', text: fixture('sobedesce/unica-backup.xxh64') }] },
]

describe('Ciclo do O ponta a ponta', () => {
  it('rotas de eventos sem ciclos', () => {
    expect(findEventCycle(ROUTES, HANDLER_EMITS)).toBeNull()
  })

  it('Carro do Freela → TPeasy → SOBEDESCE → Synquei, sem perder IDs', async () => {
    const o = await newOrgWithOwner(db, 'ciclo')
    await givePlan(db, o.orgId, 'ciclo-do-o')
    // O Carro do Freela é fechado (gate de lançamento, ADR 0023): só a conta proprietária listada entra. Aqui o dono faz esse papel.
    await allowRelease(db, 'carro-do-freela', o.userId, { kind: 'owner' })
    await giveLimits(db, o.orgId, 'sobedesce', { 'sobedesce.manifest_imports': 10 })
    await giveLimits(db, o.orgId, 'synquei', { 'synquei.organization_plans': 10 })

    // 1. job do Carro do Freela vira projeto (e reenviar o mesmo job não duplica)
    const job = {
      contract: 'carro-do-freela.job/1',
      job_id: 'job-777',
      title: 'Show de lançamento',
      production_type: 'show',
      briefing: 'Dois palcos, três câmeras.',
      crew_roles: [{ role: 'Câmera', count: 3 }],
    }
    const { projectId, created } = await importCarroJob(db, o.auth, job)
    expect(created).toBe(true)
    expect(await importCarroJob(db, o.auth, job)).toEqual({ projectId, created: false })

    // 2. roteiro do TPeasy entra como versão; volta para o TPeasy no formato do app
    const backup = toTpeasyBackup({ projectId, title: 'Abertura do show', body: '# Abertura\nBoa noite!', updatedAt: new Date() })
    expect(await importScriptFromTpeasy(db, o.auth, { projectId, backup })).toMatchObject({ version: 1 })
    expect((await exportScriptToTpeasy(db, o.auth, projectId)).scripts[0]!.body).toBe('# Abertura\nBoa noite!')

    // 3. resumo + relatórios do SOBEDESCE
    const imp = await importSobedesceManifest(db, o.auth, { projectId, descargas: fixture('sobedesce/unica-descargas.jsonl'), destinations: destinations() })
    expect(imp).toMatchObject({ duplicate: false, status: 'valid', summary: { backup_complete: true, assets_total: 3 } })
    expect(imp.runs).toEqual([expect.objectContaining({ handler: 'synquei.organization-plan', status: 'queued' })])
    const again = await importSobedesceManifest(db, o.auth, { projectId, descargas: fixture('sobedesce/unica-descargas.jsonl'), destinations: destinations() })
    expect(again.duplicate).toBe(true)

    // 4. worker gera a prévia do Synquei
    expect(await runOnce(db, { handlers: HANDLERS, routes: ROUTES, log })).toBe(1)
    const p = await getProject(db, o.auth, projectId)
    const step = (k: string) => p.steps.find((s) => s.stepKey === k)!
    expect(step('carro-do-freela').displayState).toBe('done')
    expect(step('tpeasy').displayState).toBe('done')
    expect(step('sobedesce').displayState).toBe('done')
    expect(step('synquei').displayState).toBe('needs_review')
    // o AEON está no ar na web (0043): a etapa fica disponível, ainda não começada; a Revela segue fechada por
    // lançamento (ADR 0023): a etapa aparece indisponível mesmo com o plano que a lista.
    expect(step('ai-edit').displayState).toBe('not_started')
    expect(step('finishing').displayState).toBe('unavailable')
    const run = p.runs.find((r) => r.handler === 'synquei.organization-plan')!
    expect(run.status).toBe('succeeded')
    const plan = (run.result as { plan: { assets: { asset_id: string }[]; moves: unknown[] } }).plan
    const assetKeys = (await db.sql`select asset_key from zro.project_assets where project_id = ${projectId}`).map((r) => r.asset_key)
    expect(new Set(plan.assets.map((a) => a.asset_id))).toEqual(new Set(assetKeys))
    expect(plan.moves).toEqual([])
    expect(p.events.map((e) => e.event_type).sort()).toEqual(['ingest.completed', 'job.created', 'media.manifest.ready', 'script.ready'])

    // 5. localizações e checksums gravados por destino
    const locs =
      await db.sql`select l.status, count(*)::int as n from zro.asset_locations l join zro.project_assets a on a.id = l.asset_id where a.project_id = ${projectId} group by 1`
    expect(locs).toEqual([{ status: 'verified', n: 6 }])

    // 6. prévia sob demanda conta uma vez por manifest
    const prev = await previewOrganizationPlan(db, o.auth, { projectId, manifestRowId: imp.manifestRowId })
    expect(prev.plan.preserved_asset_ids).toBe(3)
    await previewOrganizationPlan(db, o.auth, { projectId, manifestRowId: imp.manifestRowId })
    const [q] = await db.sql`select used from zro.quotas where org_id = ${o.orgId} and metric = 'synquei.organization_plans'`
    expect(Number(q!.used)).toBe(2) // 1 do worker + 1 da prévia
  })

  it('caso A no fluxo: sem Synquei a execução aparece bloqueada e a API nega com 403', async () => {
    const o = await newOrgWithOwner(db, 'so-sobedesce')
    await givePlan(db, o.orgId, 'individual-sobedesce')
    await giveLimits(db, o.orgId, 'sobedesce', { 'sobedesce.manifest_imports': 5 })
    const pid = await createProject(db, o.auth, { title: 'Só backup' })
    const imp = await importSobedesceManifest(db, o.auth, {
      projectId: pid,
      descargas: fixture('sobedesce/unica-descargas.jsonl'),
      destinations: destinations(),
    })
    expect(imp.runs).toEqual([expect.objectContaining({ status: 'blocked' })])
    const err = await expectCode(previewOrganizationPlan(db, o.auth, { projectId: pid, manifestRowId: imp.manifestRowId }), 'entitlement_required')
    expect(err.status).toBe(403)
    await expectCode(importScriptFromTpeasy(db, o.auth, { projectId: pid, backup: {} }), 'entitlement_required')
    const { steps } = await getProject(db, o.auth, pid)
    expect(steps.find((s) => s.stepKey === 'synquei')!.displayState).toBe('blocked_subscription')
  })

  it('assinatura revogada antes da execução: o worker não roda, marca bloqueado', async () => {
    const o = await newOrgWithOwner(db, 'revogado')
    await givePlan(db, o.orgId, 'ciclo-do-o')
    await giveLimits(db, o.orgId, 'sobedesce', { 'sobedesce.manifest_imports': 5 })
    const pid = await createProject(db, o.auth, { title: 'Revogado' })
    await importSobedesceManifest(db, o.auth, { projectId: pid, descargas: fixture('sobedesce/unica-descargas.jsonl'), destinations: destinations() })
    await db.asSystem('t', (tx) => tx`update zro.entitlements set status = 'revoked' where org_id = ${o.orgId} and product_id = 'synquei'`)
    await runOnce(db, { handlers: HANDLERS, routes: ROUTES, log })
    const [r] = await db.sql`select status, last_error from zro.workflow_runs where project_id = ${pid}`
    expect(r!.status).toBe('blocked')
  })

  it('manifest com divergência: ingest.failed, Synquei não recebe', async () => {
    const o = await newOrgWithOwner(db, 'divergente')
    await givePlan(db, o.orgId, 'ciclo-do-o')
    await giveLimits(db, o.orgId, 'sobedesce', { 'sobedesce.manifest_imports': 5 })
    const pid = await createProject(db, o.auth, { title: 'Divergente' })
    const bad = destinations()
    bad[1]!.reports[0]!.text = bad[1]!.reports[0]!.text.replace(/^[0-9a-f]{16}/, 'ffffffffffffffff')
    const imp = await importSobedesceManifest(db, o.auth, { projectId: pid, descargas: fixture('sobedesce/unica-descargas.jsonl'), destinations: bad })
    expect(imp.status).toBe('invalid')
    expect(imp.runs).toEqual([])
    const { steps, events } = await getProject(db, o.auth, pid)
    expect(steps.find((s) => s.stepKey === 'sobedesce')!.displayState).toBe('failed')
    expect(events.map((e) => e.event_type)).toEqual(['ingest.failed'])
  })

  it('entrega conferida do SOBEDESCE: delivery.ready v2 com o link da pasta, sem duplicar; sem plano, 403', async () => {
    const o = await newOrgWithOwner(db, 'entrega')
    await givePlan(db, o.orgId, 'individual-sobedesce')
    await giveLimits(db, o.orgId, 'sobedesce', { 'sobedesce.manifest_imports': 5 })
    const pid = await createProject(db, o.auth, { title: 'Entrega' })
    const entrega = fixture('sobedesce/entrega.json')
    const r = await importSobedesceDelivery(db, o.auth, { projectId: pid, entrega })
    expect(r).toMatchObject({ duplicate: false, files: 3, folderUrl: 'https://drive.google.com/drive/folders/pastaTesteEntrega01' })
    expect((await importSobedesceDelivery(db, o.auth, { projectId: pid, entrega })).duplicate).toBe(true)
    const { events } = await getProject(db, o.auth, pid)
    const ev = events.filter((e) => e.event_type === 'delivery.ready')
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ schema_version: 2, producer: 'sobedesce', payload: { source: 'sobedesce', verified: true, checksum: 'md5', files: 3 } })
    // registrar de novo não gasta cota
    const [u] =
      await db.sql`select coalesce(sum(amount), 0)::int as n from zro.usage_events where org_id = ${o.orgId} and metric = 'sobedesce.manifest_imports'`
    expect(u!.n).toBe(1)

    // comprovante adulterado (link de outro lugar) é recusado
    const outro = JSON.parse(entrega)
    outro.drive.link = 'https://exemplo.com/pasta'
    await expectCode(importSobedesceDelivery(db, o.auth, { projectId: pid, entrega: JSON.stringify(outro) }), 'invalid_input')

    const sem = await newOrgWithOwner(db, 'entrega-sem-plano')
    const pid2 = await createProject(db, sem.auth, { title: 'Sem plano' })
    expect((await expectCode(importSobedesceDelivery(db, sem.auth, { projectId: pid2, entrega }), 'entitlement_required')).status).toBe(403)
  })
})
