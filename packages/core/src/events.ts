/**
 * Publicação de eventos com outbox no próprio banco (PRD §7.3): evento e execuções nascem na mesma transação
 * que a mudança de estado. A idempotency_key por organização impede duplicar evento e execução.
 * Rotas (evento → handler) vêm de @zro/integrations; aqui não há conhecimento de produto.
 */
import { randomUUID } from 'node:crypto'
import { checkEntitlement } from '@zro/billing'
import type { Queryable } from '@zro/db'
import { validateEventPayload, type EventType } from '@zro/media-contracts'
import { DomainError } from '@zro/observability'

export type RouteTarget = { handler: string; productId: string | null; feature: string | null; maxAttempts?: number }
export type RouteTable = Partial<Record<EventType, RouteTarget[]>>

export type PublishInput = {
  orgId: string
  projectId: string | null
  type: EventType
  version?: number
  producer: string
  payload: Record<string, unknown>
  idempotencyKey: string
  correlationId?: string
  causationId?: string | null
  createdBy?: string | null
}

export type PublishResult = { eventId: string; duplicate: boolean; runs: { id: string; handler: string; status: string }[] }

export async function publishEvent(tx: Queryable, input: PublishInput, routes: RouteTable): Promise<PublishResult> {
  const version = input.version ?? 1
  const valid = validateEventPayload(input.type, version, input.payload)
  if (!valid.ok) throw new DomainError('invalid_input', `Evento fora do contrato: ${valid.message}`)
  if (input.idempotencyKey.length < 8) throw new DomainError('invalid_input', 'idempotency_key curta demais.')
  const [ev] = await tx`
    insert into zro.workflow_events (org_id, project_id, event_type, schema_version, producer, occurred_at, correlation_id, causation_id, idempotency_key, payload)
    values (${input.orgId}, ${input.projectId}, ${input.type}, ${version}, ${input.producer}, now(), ${input.correlationId ?? randomUUID()},
            ${input.causationId ?? null}, ${input.idempotencyKey}, ${tx.json(input.payload as never)})
    on conflict (org_id, idempotency_key) do nothing
    returning id`
  if (!ev) {
    const [old] = await tx`select id from zro.workflow_events where org_id = ${input.orgId} and idempotency_key = ${input.idempotencyKey}`
    return { eventId: old?.id as string, duplicate: true, runs: [] }
  }
  const runs: PublishResult['runs'] = []
  for (const target of routes[input.type] ?? []) {
    // Sem assinatura do produto de destino: a execução fica visível como bloqueada, não some.
    let status = 'queued'
    let lastError: string | null = null
    if (target.productId) {
      const check = await checkEntitlement(tx, input.orgId, target.productId, target.feature)
      if (!check.ok) {
        status = 'blocked'
        lastError = check.message
      }
    }
    const [run] = await tx`
      insert into zro.workflow_runs (org_id, project_id, event_id, handler, product_id, status, max_attempts, last_error, created_by)
      values (${input.orgId}, ${input.projectId}, ${ev.id as string}, ${target.handler}, ${target.productId}, ${status}, ${target.maxAttempts ?? 5}, ${lastError}, ${input.createdBy ?? null})
      returning id`
    runs.push({ id: run!.id as string, handler: target.handler, status })
  }
  return { eventId: ev.id as string, duplicate: false, runs }
}

/**
 * Garante que nenhuma cadeia de eventos volte ao começo (PRD §7.3: sem ciclos infinitos de triggers).
 * `emits` = tipos que cada handler pode publicar ao terminar.
 */
export function findEventCycle(routes: RouteTable, emits: Record<string, EventType[]>): EventType[] | null {
  const graph = new Map<EventType, EventType[]>()
  for (const [type, targets] of Object.entries(routes) as [EventType, RouteTarget[]][]) {
    graph.set(
      type,
      targets.flatMap((t) => emits[t.handler] ?? []),
    )
  }
  const state = new Map<EventType, 'visiting' | 'done'>()
  const stack: EventType[] = []
  const visit = (n: EventType): EventType[] | null => {
    if (state.get(n) === 'done') return null
    if (state.get(n) === 'visiting') return [...stack.slice(stack.indexOf(n)), n]
    state.set(n, 'visiting')
    stack.push(n)
    for (const m of graph.get(n) ?? []) {
      const c = visit(m)
      if (c) return c
    }
    stack.pop()
    state.set(n, 'done')
    return null
  }
  for (const n of graph.keys()) {
    const c = visit(n)
    if (c) return c
  }
  return null
}
