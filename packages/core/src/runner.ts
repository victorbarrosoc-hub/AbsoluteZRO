/**
 * Executor da fila (PRD §7.3): reserva com SKIP LOCKED, retries com backoff e jitter, dead-letter, reprocessamento
 * manual seguro e nenhuma repetição automática de despacho ambíguo (regra herdada do NOSSOM): se não dá para
 * saber se o efeito externo aconteceu, a execução para em "requer revisão".
 */
import { randomUUID } from 'node:crypto'
import type { Authenticated } from '@zro/auth'
import { checkEntitlement } from '@zro/billing'
import type { Database, Tx } from '@zro/db'
import type { EventType } from '@zro/media-contracts'
import { audit, createLogger, DomainError, type Logger } from '@zro/observability'
import { authorize, EDIT_ROLES } from './authz'
import { publishEvent, type RouteTable } from './events'
import { setStepState } from './projects'

export class RetryableError extends Error {}
/** Erro definitivo: tentar de novo não muda o resultado. */
export class PermanentError extends Error {}
/** O efeito externo pode ter acontecido: não repetir sozinho. */
export class AmbiguousError extends Error {}
/** Falta assinatura ou quota no momento da execução. */
export class BlockedError extends Error {}

export type RunRow = {
  id: string
  org_id: string
  project_id: string | null
  event_id: string
  handler: string
  product_id: string | null
  attempts: number
  max_attempts: number
  created_by: string | null
}
export type EventRow = { id: string; event_type: EventType; schema_version: number; correlation_id: string; payload: Record<string, unknown>; producer: string }

export type Emit = { type: EventType; version?: number; payload: Record<string, unknown>; idempotencyKey: string }
export type HandlerOutcome = { result: Record<string, unknown>; emit?: Emit[] }
export type HandlerContext = { db: Database; run: RunRow; event: EventRow; log: Logger }

export type HandlerDef = {
  name: string
  productId: string | null
  feature: string | null
  /** true = pode rodar de novo sem efeito duplicado (seguro reenfileirar após queda do worker). */
  idempotent: boolean
  emits: EventType[]
  run(ctx: HandlerContext): Promise<HandlerOutcome>
}

export type RunnerOptions = {
  handlers: Record<string, HandlerDef>
  routes: RouteTable
  workerId?: string
  batchSize?: number
  log?: Logger
  backoffBaseMs?: number
  backoffCapMs?: number
}

export function backoffDelay(attempt: number, base = 5_000, cap = 15 * 60_000, random = Math.random): number {
  const raw = Math.min(cap, base * 2 ** Math.max(0, attempt - 1))
  return Math.round(raw * (0.8 + random() * 0.4))
}

/** Reserva só execuções dos handlers que este worker conhece (vários workers podem dividir os produtos). */
export async function runOnce(db: Database, opts: RunnerOptions): Promise<number> {
  const workerId = opts.workerId ?? `worker-${randomUUID().slice(0, 8)}`
  const log = opts.log ?? createLogger('worker')
  const claimed = (await db.asSystem('worker: reservar execuções', (tx) => tx`
    update zro.workflow_runs r set status = 'running', locked_at = now(), locked_by = ${workerId}, attempts = r.attempts + 1
    where r.id in (
      select id from zro.workflow_runs where status = 'queued' and next_attempt_at <= now()
        and handler = any(${Object.keys(opts.handlers)}::text[])
      order by next_attempt_at limit ${opts.batchSize ?? 10} for update skip locked)
    returning r.id, r.org_id, r.project_id, r.event_id, r.handler, r.product_id, r.attempts, r.max_attempts, r.created_by`)) as unknown as RunRow[]

  for (const run of claimed) {
    const def = opts.handlers[run.handler]
    const finish = (status: string, fields: { error?: string | null; result?: Record<string, unknown> | null; delayMs?: number } = {}) =>
      async (tx: Tx) => {
        const r = await tx`
          update zro.workflow_runs set status = ${status}, last_error = ${fields.error ?? null},
            result = coalesce(${fields.result ? tx.json(fields.result as never) : null}::jsonb, result),
            next_attempt_at = now() + make_interval(secs => ${(fields.delayMs ?? 0) / 1000}::float8),
            locked_at = null, locked_by = null
          where id = ${run.id} and locked_by = ${workerId} and status = 'running' returning id`
        return r.length > 0
      }
    try {
      if (!def) throw new PermanentError(`Handler desconhecido: ${run.handler}`)
      const [event] = (await db.asSystem('worker: ler evento', (tx) => tx`
        select id, event_type, schema_version, correlation_id, payload, producer from zro.workflow_events where id = ${run.event_id}`)) as unknown as EventRow[]
      if (!event) throw new PermanentError('Evento não encontrado.')
      // Revogação ou cancelamento interrompe execuções que ainda não começaram (PRD §5.2).
      if (def.productId) {
        const check = await db.asSystem('worker: entitlement', (tx) => checkEntitlement(tx, run.org_id, def.productId!, def.feature))
        if (!check.ok) throw new BlockedError(check.message)
      }
      const outcome = await def.run({ db, run, event, log })
      await db.asSystem('worker: concluir execução', async (tx) => {
        if (!(await finish('succeeded', { result: outcome.result })(tx))) return
        for (const e of outcome.emit ?? []) {
          await publishEvent(tx, {
            orgId: run.org_id,
            projectId: run.project_id,
            type: e.type,
            version: e.version,
            producer: `hub:${def.name}`,
            payload: e.payload,
            idempotencyKey: e.idempotencyKey,
            correlationId: event.correlation_id,
            causationId: event.id,
          }, opts.routes)
        }
      })
      log.info('run.succeeded', { run: run.id, handler: run.handler })
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 500)
      let status: string
      let delayMs = 0
      if (err instanceof BlockedError) status = 'blocked'
      else if (err instanceof AmbiguousError) status = 'requires_review'
      else if (err instanceof PermanentError || err instanceof DomainError) status = 'failed'
      else if (run.attempts >= run.max_attempts) status = 'dead_letter'
      else {
        status = 'queued'
        delayMs = backoffDelay(run.attempts, opts.backoffBaseMs, opts.backoffCapMs)
      }
      await db.asSystem('worker: registrar falha', async (tx) => {
        if (!(await finish(status, { error: message, delayMs })(tx))) return
        if (run.project_id && def?.productId && ['blocked', 'failed', 'dead_letter', 'requires_review'].includes(status)) {
          await setStepState(tx, {
            projectId: run.project_id,
            orgId: run.org_id,
            stepKey: def.productId,
            state: status === 'blocked' ? 'blocked_subscription' : status === 'requires_review' ? 'needs_review' : 'failed',
            source: `hub:${def.name}`,
            detail: { run_id: run.id, message },
          })
        }
        await audit(tx, { orgId: run.org_id, actorKind: 'system', action: `run.${status}`, targetType: 'workflow_run', targetId: run.id, metadata: { handler: run.handler, attempt: run.attempts, error: message } })
      })
      log.warn('run.not_succeeded', { run: run.id, handler: run.handler, status, attempt: run.attempts })
    }
  }
  return claimed.length
}

/**
 * Execuções presas em "running" além do prazo (worker caiu): idempotentes voltam para a fila;
 * as demais vão para revisão, nunca para nova tentativa automática.
 */
export async function recoverStaleRuns(db: Database, handlers: Record<string, HandlerDef>, leaseMs = 10 * 60_000): Promise<{ requeued: number; review: number }> {
  return db.asSystem('worker: recuperar execuções presas', async (tx) => {
    const stale = await tx`select id, handler, org_id from zro.workflow_runs where status = 'running' and locked_at < now() - make_interval(secs => ${leaseMs / 1000}::float8) for update skip locked`
    let requeued = 0
    let review = 0
    for (const s of stale) {
      if (handlers[s.handler as string]?.idempotent) {
        await tx`update zro.workflow_runs set status = 'queued', locked_at = null, locked_by = null, last_error = 'Worker interrompido; reenfileirado (operação idempotente).' where id = ${s.id as string}`
        requeued++
      } else {
        await tx`update zro.workflow_runs set status = 'requires_review', locked_at = null, locked_by = null, last_error = 'Execução interrompida sem confirmação. Revise antes de repetir.' where id = ${s.id as string}`
        review++
      }
      await audit(tx, { orgId: s.org_id as string, actorKind: 'system', action: 'run.recovered', targetType: 'workflow_run', targetId: s.id as string })
    }
    return { requeued, review }
  })
}

const REPROCESSABLE = ['failed', 'dead_letter', 'requires_review', 'blocked']

/** Reprocessamento manual: nova execução ligada à anterior; clicar duas vezes não cria duas. */
export async function reprocessRun(db: Database, auth: Authenticated | null, runId: string, handlers: Record<string, HandlerDef>): Promise<{ id: string; created: boolean }> {
  const base = await authorize(db, auth, { roles: EDIT_ROLES })
  const [run] = await db.asUser({ userId: base.userId, orgId: base.orgId }, (tx) => tx`
    select id, event_id, handler, product_id, project_id, status, max_attempts from zro.workflow_runs where id = ${runId}`)
  if (!run) throw new DomainError('not_found', 'Execução não encontrada.')
  if (!REPROCESSABLE.includes(run.status as string)) throw new DomainError('conflict', 'Só execuções com falha, em revisão ou bloqueadas podem ser repetidas.')
  const def = handlers[run.handler as string]
  // Mesma cadeia de autorização da operação original: projeto, entitlement e feature.
  const actor = await authorize(db, auth, {
    roles: EDIT_ROLES,
    project: run.project_id ? { id: run.project_id as string, access: 'edit' } : undefined,
    product: def?.productId ? { id: def.productId, feature: def.feature } : undefined,
  })
  return db.asUser({ userId: actor.userId, orgId: actor.orgId }, async (tx) => {
    const [created] = await tx`
      insert into zro.workflow_runs (org_id, project_id, event_id, handler, product_id, status, max_attempts, reprocess_of, created_by)
      values (${actor.orgId}, ${run.project_id as string | null}, ${run.event_id as string}, ${run.handler as string}, ${run.product_id as string | null}, 'queued', ${run.max_attempts as number}, ${runId}, ${actor.userId})
      on conflict (event_id, handler, reprocess_of) do nothing returning id`
    if (!created) {
      const [existing] = await tx`select id from zro.workflow_runs where reprocess_of = ${runId} and handler = ${run.handler as string}`
      return { id: existing!.id as string, created: false }
    }
    await audit(tx, { orgId: actor.orgId, actorUserId: actor.userId, action: 'run.reprocess_requested', targetType: 'workflow_run', targetId: runId, metadata: { new_run: created.id } })
    return { id: created.id as string, created: true }
  })
}

export async function listRuns(db: Database, auth: Authenticated | null, filter: { status?: string } = {}) {
  const actor = await authorize(db, auth)
  const rows = await db.asUser({ userId: actor.userId, orgId: actor.orgId }, (tx) => tx`
    select r.id, r.handler, r.product_id, r.status, r.attempts, r.max_attempts, r.last_error, r.created_at, r.updated_at, r.reprocess_of,
           r.project_id, p.title as project_title, e.event_type
    from zro.workflow_runs r join zro.workflow_events e on e.id = r.event_id left join zro.projects p on p.id = r.project_id
    where r.org_id = ${actor.orgId} and (${filter.status ?? null}::text is null or r.status = ${filter.status ?? null})
    order by r.created_at desc limit 200`)
  return { actor, runs: rows }
}
