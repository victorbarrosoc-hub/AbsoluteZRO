/** Handlers do worker e rotas de eventos (PRD §7.3). Cada handler declara o que pode emitir (sem ciclos). */
import { consumeQuota } from '@zro/billing'
import { BlockedError, PermanentError, setStepState, type HandlerDef, type RouteTable } from '@zro/core'
import { validateManifest } from '@zro/media-contracts'
import { audit } from '@zro/observability'
import { planOrganization } from './synquei'

export const synqueiOrganizationPlan: HandlerDef = {
  name: 'synquei.organization-plan',
  productId: 'synquei',
  feature: 'organization_plan',
  idempotent: true,
  emits: [],
  async run({ db, run, event }) {
    const ref = event.payload as { manifest_row_id: string }
    const [row] = await db.asSystem(
      'handler: ler manifest',
      (tx) => tx`
      select id, project_id, payload, status from zro.media_manifests where id = ${ref.manifest_row_id} and org_id = ${run.org_id}`,
    )
    if (!row) throw new PermanentError('Manifest não encontrado.')
    const v = validateManifest(row.payload)
    if (v.status === 'invalid' || !v.manifest) throw new PermanentError('Manifest inválido: o Synquei não consome manifest com erros.')
    const plan = planOrganization(v.manifest)
    await db.asSystem('handler: quota e etapa', async (tx) => {
      const q = await consumeQuota(tx, {
        orgId: run.org_id,
        metric: 'synquei.organization_plans',
        idempotencyKey: `run:${run.id}`,
        projectId: run.project_id,
        workflowRunId: run.id,
      })
      if (!q.ok) throw new BlockedError(q.message)
      await setStepState(tx, {
        projectId: row.project_id as string,
        orgId: run.org_id,
        stepKey: 'synquei',
        state: 'needs_review',
        source: 'hub:synquei.organization-plan',
        detail: { manifest_id: plan.manifest_id, assets: plan.preserved_asset_ids, bins: plan.bins.length, warnings: plan.warnings, run_id: run.id },
      })
      await audit(tx, {
        orgId: run.org_id,
        actorKind: 'system',
        action: 'synquei.organization_plan_ready',
        targetType: 'project',
        targetId: row.project_id as string,
        metadata: { manifest: plan.manifest_id, assets: plan.preserved_asset_ids },
      })
    })
    return { result: { plan } }
  },
}

export const HANDLERS: Record<string, HandlerDef> = {
  [synqueiOrganizationPlan.name]: synqueiOrganizationPlan,
}

/**
 * Rotas atuais. Os demais eventos ficam registrados no histórico do projeto: os consumidores são apps externos
 * (Synquei sync, NOSSOM) ou ferramentas futuras (AEON, Revela), e o HUB não finge processá-los.
 */
export const ROUTES: RouteTable = {
  'media.manifest.ready': [{ handler: synqueiOrganizationPlan.name, productId: 'synquei', feature: 'organization_plan', maxAttempts: 5 }],
}

export const HANDLER_EMITS = Object.fromEntries(Object.values(HANDLERS).map((h) => [h.name, h.emits]))
