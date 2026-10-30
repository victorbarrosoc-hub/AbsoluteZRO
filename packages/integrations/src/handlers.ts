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
 * `script.version.sent` (Criação F8) também não tem rota: o roteiro já está na caixa de entrada do TPeasy
 * (zro.app_entregas, migração 0040) quando o evento nasce, e quem consome é o próprio TPeasy ao abrir (entregas.ts).
 */
export const ROUTES: RouteTable = {
  'media.manifest.ready': [{ handler: synqueiOrganizationPlan.name, productId: 'synquei', feature: 'organization_plan', maxAttempts: 5 }],
}

/**
 * Pronto e DESLIGADO: o inventário que o freela cadastra no Carro do Freela (freela.inventario/1) vai para o Maestro,
 * que guarda os itens como só leitura no perfil do freela, ligado pelo `sub` da conta Absolute ZRO
 * (products/maestro/src/lib/freelas/equipamentos.ts, sincronizarInventarioDoCarro). Não entra em ROUTES nem em
 * HANDLERS enquanto o HUB não tiver o endpoint de entrada e o Maestro não tiver o endpoint de entrega assinado. O Carro
 * já tem banco e fila (29/10/2026), mas a publicação dele também está desligada: nenhum evento é publicado e o HUB não
 * finge processar nada (docs/integration-contracts/maestro-carro-do-freela.md).
 */
export const maestroFreelaInventario: HandlerDef = {
  name: 'maestro.freela-inventario',
  productId: 'maestro',
  feature: null,
  idempotent: true,
  emits: [],
  async run() {
    throw new PermanentError('Inventário do freela ainda não está ligado: o Carro do Freela não tem banco.')
  },
}

/** Rotas registradas mas desligadas (não vão ao worker). Entram na conferência de ciclo com as ativas. */
export const DISABLED_ROUTES: RouteTable = {
  'freela.inventario.atualizado': [{ handler: maestroFreelaInventario.name, productId: 'maestro', feature: null, maxAttempts: 5 }],
}

export const HANDLER_EMITS = Object.fromEntries([...Object.values(HANDLERS), maestroFreelaInventario].map((h) => [h.name, h.emits]))
