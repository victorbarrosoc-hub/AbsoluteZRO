/** Projetos, etapas do Ciclo do O e documentos versionados (PRD §4.2, §7.1). */
import type { Authenticated } from '@zro/auth'
import { productAccessFor } from '@zro/billing'
import type { Database, Queryable } from '@zro/db'
import { ProjectCreateSchema, type StepState } from '@zro/media-contracts'
import { audit, DomainError } from '@zro/observability'
import { authorize, EDIT_ROLES, type Actor } from './authz'

export async function createProject(db: Database, auth: Authenticated | null, raw: unknown, opts: { origin?: string } = {}): Promise<string> {
  const actor = await authorize(db, auth, { roles: EDIT_ROLES })
  return createProjectAs(db, actor, raw, opts)
}

export async function createProjectAs(db: Database, actor: Actor, raw: unknown, opts: { origin?: string } = {}): Promise<string> {
  const parsed = ProjectCreateSchema.safeParse(raw)
  if (!parsed.success) throw new DomainError('invalid_input', parsed.error.issues[0]?.message ?? 'Dados do projeto inválidos.')
  const p = parsed.data
  return db.asUser({ userId: actor.userId, orgId: actor.orgId }, async (tx) => {
    const [row] = await tx`
      insert into zro.projects (org_id, title, type, client_reference, visibility, origin, brief, external_links, created_by)
      values (${actor.orgId}, ${p.title}, ${p.type}, ${p.client_reference ?? null}, ${p.visibility}, ${opts.origin ?? 'hub'},
              ${tx.json((p.brief ?? {}) as never)}, ${tx.json((p.external_links ?? []) as never)}, ${actor.userId})
      returning id`
    const id = row!.id as string
    // Cada etapa começa com o estado real: ferramenta em desenvolvimento = indisponível.
    await tx`
      insert into zro.project_steps (project_id, org_id, step_key, state, source)
      select ${id}, ${actor.orgId}, p.id, case when p.stage in ('active', 'beta') then 'not_started' else 'unavailable' end, 'hub'
      from zro.products p`
    await audit(tx, {
      orgId: actor.orgId,
      actorUserId: actor.userId,
      action: 'project.created',
      targetType: 'project',
      targetId: id,
      metadata: { origin: opts.origin ?? 'hub' },
    })
    return id
  })
}

export type StepView = {
  stepKey: string
  name: string
  roleInFlow: string
  stage: string
  stepOrder: number
  state: StepState
  /** Estado mostrado: soma o estado gravado com a assinatura da organização. */
  displayState: StepState
  source: string | null
  lastSyncedAt: Date | null
  updatedAt: Date
  access: string
  externalUrl: string | null
  detail: Record<string, unknown>
}

/** Ferramenta lançada e não contratada aparece como "bloqueado por assinatura", sem esconder o histórico. */
export function displayStateFor(state: StepState, access: string): StepState {
  if (access === 'coming_soon' || access === 'disabled') return 'unavailable'
  // Fechado por lançamento (ADR 0023): nada de "contrate" nem de começar; o que já aconteceu (histórico) continua visível.
  if (access === 'closed' && (state === 'not_started' || state === 'ready' || state === 'waiting_material')) return 'unavailable'
  if (access === 'available' && (state === 'not_started' || state === 'ready' || state === 'waiting_material')) return 'blocked_subscription'
  return state
}

export async function listProjects(db: Database, auth: Authenticated | null, filter: { status?: string; q?: string } = {}) {
  const actor = await authorize(db, auth)
  const rows = await db.asUser(
    { userId: actor.userId, orgId: actor.orgId },
    (tx) => tx`
    select p.id, p.title, p.type, p.status, p.client_reference, p.origin, p.visibility, p.created_at, p.updated_at,
      (select count(*)::int from zro.project_steps s where s.project_id = p.id and s.state = 'done') as steps_done,
      (select count(*)::int from zro.project_steps s where s.project_id = p.id and s.state in ('needs_review', 'failed')) as steps_attention
    from zro.projects p
    where p.org_id = ${actor.orgId}
      and (${filter.status ?? null}::text is null or p.status = ${filter.status ?? null})
      and (${filter.q ?? null}::text is null or p.title ilike ${'%' + (filter.q ?? '') + '%'})
    order by p.updated_at desc limit 200`,
  )
  return { actor, projects: rows }
}

export async function getProject(db: Database, auth: Authenticated | null, projectId: string) {
  const actor = await authorize(db, auth, { project: { id: projectId, access: 'view' } })
  return db.asUser({ userId: actor.userId, orgId: actor.orgId }, async (tx) => {
    const [project] = await tx`select p.*, u.display_name as created_by_name, zro.can_edit_project(p.id) as can_edit
                              from zro.projects p left join zro.users u on u.id = p.created_by where p.id = ${projectId}`
    if (!project) throw new DomainError('project_not_found', 'Projeto não encontrado.')
    const access = await productAccessFor(tx, actor.orgId)
    const stepRows = await tx`select * from zro.project_steps where project_id = ${projectId}`
    // O convidado não enxerga o plano da organização (RLS): para ele, ferramenta lançada conta como contratada, e a etapa
    // mostra o estado real em vez de "contratar".
    const guest = actor.role === 'guest'
    const steps: StepView[] = access.map((x) => {
      const a = guest && x.access === 'available' ? { ...x, access: 'contracted' as typeof x.access } : x
      const s = stepRows.find((r) => r.step_key === a.productId)
      const state = ((s?.state as StepState) ?? (a.access === 'coming_soon' || a.access === 'closed' ? 'unavailable' : 'not_started')) as StepState
      return {
        stepKey: a.productId,
        name: a.name,
        roleInFlow: a.roleInFlow,
        stage: a.stage,
        stepOrder: a.stepOrder,
        state,
        displayState: displayStateFor(state, a.access),
        source: (s?.source as string) ?? null,
        lastSyncedAt: (s?.last_synced_at as Date) ?? null,
        updatedAt: (s?.updated_at as Date) ?? (project.created_at as Date),
        access: a.access,
        externalUrl: a.ssoStartUrl ?? a.externalUrl,
        detail: (s?.detail as Record<string, unknown>) ?? {},
      }
    })
    const documents = await tx`
      select distinct on (kind) id, kind, version, title, body, source, created_at from zro.project_documents
      where project_id = ${projectId} order by kind, version desc`
    const manifests = await tx`
      select id, manifest_id, source_app, status, verification, issues, created_at,
        (select count(*)::int from zro.project_assets a where a.manifest_row_id = m.id) as assets
      from zro.media_manifests m where project_id = ${projectId} order by created_at desc limit 20`
    const runs = await tx`
      select r.id, r.handler, r.product_id, r.status, r.attempts, r.max_attempts, r.last_error, r.result, r.created_at, r.updated_at, r.reprocess_of,
             e.event_type, e.occurred_at
      from zro.workflow_runs r join zro.workflow_events e on e.id = r.event_id
      where r.project_id = ${projectId} order by r.created_at desc limit 30`
    const events =
      await tx`select id, event_type, schema_version, producer, occurred_at, payload from zro.workflow_events where project_id = ${projectId} order by occurred_at desc limit 30`
    // Equipe do projeto (a da escala do Carro entra aqui) e convites ainda abertos (o RLS só mostra a quem convida).
    const team = await tx`
      select pm.user_id, pm.role, pm.function, u.display_name from zro.project_members pm join zro.users u on u.id = pm.user_id
      where pm.project_id = ${projectId} order by pm.created_at`
    const invites = await tx`
      select id, email, project_role, project_function, expires_at from zro.invitations
      where project_id = ${projectId} and accepted_at is null and revoked_at is null and expires_at > now() order by created_at`
    return { actor, project, steps, documents, manifests, runs, events, access, team, invites }
  })
}

export async function updateProject(
  db: Database,
  auth: Authenticated | null,
  projectId: string,
  patch: { title?: string; status?: string; client_reference?: string | null },
) {
  const actor = await authorize(db, auth, { project: { id: projectId, access: 'edit' } })
  if (patch.status && !['active', 'paused', 'delivered', 'archived'].includes(patch.status)) throw new DomainError('invalid_input', 'Status inválido.')
  if (patch.title !== undefined && (!patch.title.trim() || patch.title.length > 160)) throw new DomainError('invalid_input', 'Nome inválido.')
  await db.asUser({ userId: actor.userId, orgId: actor.orgId }, async (tx) => {
    await tx`update zro.projects set
      title = coalesce(${patch.title?.trim() ?? null}, title),
      status = coalesce(${patch.status ?? null}, status),
      client_reference = case when ${patch.client_reference !== undefined} then ${patch.client_reference ?? null} else client_reference end
      where id = ${projectId}`
    await audit(tx, {
      orgId: actor.orgId,
      actorUserId: actor.userId,
      action: 'project.updated',
      targetType: 'project',
      targetId: projectId,
      metadata: { fields: Object.keys(patch) },
    })
  })
}

/** Nova versão de briefing ou roteiro. Versões antigas ficam. */
export async function addDocumentVersion(
  tx: Queryable,
  actor: { userId: string; orgId: string },
  input: { projectId: string; kind: 'brief' | 'script'; title: string; body: string; source: string; externalRef?: string | null },
): Promise<{ id: string; version: number }> {
  if (input.body.length > 200_000) throw new DomainError('invalid_input', 'Texto muito longo (máximo 200 mil caracteres).')
  await tx`select pg_advisory_xact_lock(hashtextextended(${'doc:' + input.projectId + ':' + input.kind}, 0))`
  const [v] = await tx`select coalesce(max(version), 0)::int + 1 as v from zro.project_documents where project_id = ${input.projectId} and kind = ${input.kind}`
  const version = v!.v as number
  const [row] = await tx`
    insert into zro.project_documents (project_id, org_id, kind, version, title, body, source, external_ref, created_by)
    values (${input.projectId}, ${actor.orgId}, ${input.kind}, ${version}, ${input.title.slice(0, 300)}, ${input.body}, ${input.source}, ${input.externalRef ?? null}, ${actor.userId})
    returning id`
  return { id: row!.id as string, version }
}

export async function saveDocument(
  db: Database,
  auth: Authenticated | null,
  input: { projectId: string; kind: 'brief' | 'script'; title: string; body: string },
) {
  const actor = await authorize(db, auth, { project: { id: input.projectId, access: 'edit' } })
  return db.asUser({ userId: actor.userId, orgId: actor.orgId }, async (tx) => {
    const doc = await addDocumentVersion(tx, actor, { ...input, source: 'hub' })
    await audit(tx, {
      orgId: actor.orgId,
      actorUserId: actor.userId,
      action: `project.${input.kind}_saved`,
      targetType: 'project',
      targetId: input.projectId,
      metadata: { version: doc.version },
    })
    return doc
  })
}

export async function documentHistory(db: Database, auth: Authenticated | null, projectId: string, kind: 'brief' | 'script') {
  const actor = await authorize(db, auth, { project: { id: projectId, access: 'view' } })
  return db.asUser(
    { userId: actor.userId, orgId: actor.orgId },
    (tx) => tx`
    select d.id, d.version, d.title, d.source, d.created_at, u.display_name as author
    from zro.project_documents d left join zro.users u on u.id = d.created_by
    where d.project_id = ${projectId} and d.kind = ${kind} order by d.version desc`,
  )
}

/** Etapa do projeto, gravada pelo sistema (adaptadores, worker) ou por quem edita o projeto. */
export async function setStepState(
  tx: Queryable,
  input: { projectId: string; orgId: string; stepKey: string; state: StepState; source: string; detail?: Record<string, unknown> },
): Promise<void> {
  await tx`
    insert into zro.project_steps (project_id, org_id, step_key, state, source, last_synced_at, detail)
    values (${input.projectId}, ${input.orgId}, ${input.stepKey}, ${input.state}, ${input.source}, now(), ${tx.json((input.detail ?? {}) as never)})
    on conflict (project_id, step_key) do update set state = excluded.state, source = excluded.source,
      last_synced_at = excluded.last_synced_at, detail = excluded.detail`
}
