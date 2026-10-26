/**
 * Operações de produto expostas pela API do HUB. Toda função passa pela cadeia de autorização completa
 * (@zro/core authorize) antes de tocar em dados: chamada direta sem entitlement recebe 403.
 */
import { hashToken, newToken, normalizeEmail, type Authenticated } from '@zro/auth'
import { consumeQuota } from '@zro/billing'
import { addDocumentVersion, authorize, createProjectAs, EDIT_ROLES, INVITE_TTL_MS, publishEvent, setStepState } from '@zro/core'
import type { Database } from '@zro/db'
import { CarroCrewSchema, CarroJobSchema, validateManifest, type ZroMediaManifest } from '@zro/media-contracts'
import { audit, DomainError } from '@zro/observability'
import { projectInputFromJob } from './carro'
import { ROUTES } from './handlers'
import { buildSobedesceManifest, parseDescargas, type DestinationInput } from './sobedesce'
import { planOrganization } from './synquei'
import { scriptFromTpeasyBackup, toTpeasyBackup } from './tpeasy'

// ───────────── SOBEDESCE: importar resumo de cartão ─────────────

export type SobedesceImportInput = {
  projectId: string
  /** Conteúdo do descargas.jsonl (uma ou mais linhas). */
  descargas: string
  /** Qual descarga importar quando o arquivo tem várias (id da linha). Sem id: a última. */
  descargaId?: string
  destinations: DestinationInput[]
}

export async function importSobedesceManifest(db: Database, auth: Authenticated | null, input: SobedesceImportInput) {
  const actor = await authorize(db, auth, {
    roles: EDIT_ROLES,
    project: { id: input.projectId, access: 'edit' },
    product: { id: 'sobedesce', feature: 'manifest_import' },
    quota: { metric: 'sobedesce.manifest_imports' },
  })
  if (input.descargas.length > 20_000_000) throw new DomainError('invalid_input', 'Resumo grande demais (máximo 20 MB).')
  const parsed = parseDescargas(input.descargas.endsWith('\n') ? input.descargas : input.descargas + '\n')
  if (!parsed.entries.length) {
    throw new DomainError('invalid_input', 'Nenhuma descarga válida no arquivo.', { skipped: parsed.skipped.slice(0, 10) })
  }
  const entry = input.descargaId ? parsed.entries.find((e) => e.id === input.descargaId) : parsed.entries.at(-1)
  if (!entry) throw new DomainError('invalid_input', 'Descarga não encontrada no arquivo.')
  let manifest: ZroMediaManifest
  try {
    manifest = buildSobedesceManifest({ projectId: input.projectId, entry, destinations: input.destinations })
  } catch (e) {
    throw new DomainError('invalid_input', e instanceof Error ? e.message : 'Resumo inválido.')
  }
  const validation = validateManifest(manifest)

  // Quota numa transação de sistema; a chave é a própria descarga, então reimportar não conta de novo.
  const q = await db.asSystem('sobedesce: quota de importação', (tx) =>
    consumeQuota(tx, {
      orgId: actor.orgId,
      userId: actor.userId,
      metric: 'sobedesce.manifest_imports',
      idempotencyKey: `sobedesce-import:${input.projectId}:${manifest.manifest_id}`,
      projectId: input.projectId,
    }),
  )
  if (!q.ok) throw new DomainError(q.code, q.message)

  return db.asUser({ userId: actor.userId, orgId: actor.orgId }, async (tx) => {
    const [row] = await tx`
      insert into zro.media_manifests (org_id, project_id, manifest_id, schema_version, source_app, job_id, status, verification, issues, payload, imported_by)
      values (${actor.orgId}, ${input.projectId}, ${manifest.manifest_id}, ${manifest.schema_version}, ${manifest.source_app}, ${manifest.job_id},
              ${validation.status}, ${tx.json(manifest.verification_summary as never)}, ${tx.json(validation.issues as never)}, ${tx.json(manifest as never)}, ${actor.userId})
      on conflict (org_id, manifest_id) do nothing
      returning id`
    if (!row) {
      const [old] = await tx`select id, status from zro.media_manifests where org_id = ${actor.orgId} and manifest_id = ${manifest.manifest_id}`
      return {
        duplicate: true,
        manifestRowId: old?.id as string,
        status: old?.status as string,
        issues: validation.issues,
        summary: manifest.verification_summary,
        skipped: parsed.skipped,
      }
    }
    const manifestRowId = row.id as string
    for (const a of manifest.assets) {
      const [asset] = await tx`
        insert into zro.project_assets (org_id, project_id, asset_key, manifest_row_id, original_name, relative_path, size_bytes, mime, media, camera, card, warnings)
        values (${actor.orgId}, ${input.projectId}, ${a.asset_id}, ${manifestRowId}, ${a.original_name}, ${a.relative_path}, ${a.size_bytes}, ${a.mime_detected},
                ${tx.json(a.media as never)}, ${a.camera}, ${a.card}, ${tx.json(a.warnings)})
        on conflict (project_id, asset_key) do nothing
        returning id`
      // Mesmo arquivo numa segunda leva: o ativo já existe e ganha só as localizações novas.
      const assetId =
        (asset?.id as string) ??
        ((await tx`select id from zro.project_assets where project_id = ${input.projectId} and asset_key = ${a.asset_id}`)[0]!.id as string)
      for (const d of a.destinations) {
        const [loc] = await tx`
          insert into zro.asset_locations (org_id, asset_id, uri, destination_label, status, verified_at, detail)
          values (${actor.orgId}, ${assetId}, ${d.uri}, ${input.destinations.find((x) => x.id === d.destination_id)?.label ?? d.destination_id},
                  ${d.status}, ${d.verified_at}, ${tx.json({ evidence: d.evidence, manifest_id: manifest.manifest_id })})
          on conflict (asset_id, uri) do nothing
          returning id`
        if (loc && d.checksum) {
          await tx`insert into zro.asset_checksums (asset_id, org_id, algorithm, value, location_id, source)
                   values (${assetId}, ${actor.orgId}, ${d.checksum.algorithm}, ${d.checksum.value}, ${loc.id as string}, ${manifest.manifest_id})
                   on conflict do nothing`
        }
      }
    }
    const state =
      validation.status === 'invalid' ? 'failed' : manifest.verification_summary.backup_complete && validation.status === 'valid' ? 'done' : 'needs_review'
    await setStepState(tx, {
      projectId: input.projectId,
      orgId: actor.orgId,
      stepKey: 'sobedesce',
      state,
      source: manifest.source_app_contract,
      detail: { manifest_id: manifest.manifest_id, summary: manifest.verification_summary, issues: validation.issues.length },
    })
    const ref = { manifest_row_id: manifestRowId, manifest_id: manifest.manifest_id, assets: manifest.assets.length, status: validation.status }
    const common = { orgId: actor.orgId, projectId: input.projectId, producer: 'sobedesce', createdBy: actor.userId }
    const published = []
    if (validation.status === 'invalid') {
      published.push(
        await publishEvent(
          tx,
          {
            ...common,
            type: 'ingest.failed',
            payload: { ...ref, reason: validation.issues.find((i) => i.level === 'error')?.message.slice(0, 300) ?? 'manifest inválido' },
            idempotencyKey: `ingest.failed:${manifest.manifest_id}`,
          },
          ROUTES,
        ),
      )
    } else {
      published.push(
        await publishEvent(tx, { ...common, type: 'ingest.completed', payload: ref, idempotencyKey: `ingest.completed:${manifest.manifest_id}` }, ROUTES),
      )
      // Synquei só recebe manifest validado (PRD §7.2).
      published.push(
        await publishEvent(
          tx,
          { ...common, type: 'media.manifest.ready', payload: ref, idempotencyKey: `media.manifest.ready:${manifest.manifest_id}` },
          ROUTES,
        ),
      )
    }
    await audit(tx, {
      orgId: actor.orgId,
      actorUserId: actor.userId,
      action: 'sobedesce.manifest_imported',
      targetType: 'project',
      targetId: input.projectId,
      metadata: { manifest: manifest.manifest_id, status: validation.status, assets: manifest.assets.length },
    })
    return {
      duplicate: false,
      manifestRowId,
      status: validation.status,
      issues: validation.issues,
      summary: manifest.verification_summary,
      skipped: parsed.skipped,
      runs: published.flatMap((p) => p.runs),
    }
  })
}

// ───────────── Synquei: prévia de organização sob demanda ─────────────

export async function previewOrganizationPlan(db: Database, auth: Authenticated | null, input: { projectId: string; manifestRowId: string }) {
  const actor = await authorize(db, auth, {
    project: { id: input.projectId, access: 'view' },
    product: { id: 'synquei', feature: 'organization_plan' },
    quota: { metric: 'synquei.organization_plans' },
  })
  const [row] = await db.asUser(
    { userId: actor.userId, orgId: actor.orgId },
    (tx) => tx`
    select payload from zro.media_manifests where id = ${input.manifestRowId} and project_id = ${input.projectId}`,
  )
  if (!row) throw new DomainError('not_found', 'Manifest não encontrado neste projeto.')
  const v = validateManifest(row.payload)
  if (v.status === 'invalid' || !v.manifest)
    throw new DomainError('invalid_input', 'O manifest tem erros; corrija na origem e importe de novo.', { issues: v.issues.slice(0, 20) })
  const plan = planOrganization(v.manifest)
  const q = await db.asSystem('synquei: quota de prévia', (tx) =>
    consumeQuota(tx, {
      orgId: actor.orgId,
      userId: actor.userId,
      metric: 'synquei.organization_plans',
      idempotencyKey: `synquei-preview:${input.manifestRowId}`,
      projectId: input.projectId,
    }),
  )
  if (!q.ok) throw new DomainError(q.code, q.message)
  return { plan, issues: v.issues }
}

// ───────────── TPeasy ─────────────

export async function exportScriptToTpeasy(db: Database, auth: Authenticated | null, projectId: string) {
  const actor = await authorize(db, auth, { project: { id: projectId, access: 'view' }, product: { id: 'tpeasy', feature: 'script_export' } })
  const [doc] = await db.asUser(
    { userId: actor.userId, orgId: actor.orgId },
    (tx) => tx`
    select title, body, created_at from zro.project_documents where project_id = ${projectId} and kind = 'script' order by version desc limit 1`,
  )
  if (!doc) throw new DomainError('not_found', 'Este projeto ainda não tem roteiro.')
  return toTpeasyBackup({ projectId, title: doc.title as string, body: doc.body as string, updatedAt: doc.created_at as Date })
}

export async function importScriptFromTpeasy(db: Database, auth: Authenticated | null, input: { projectId: string; backup: unknown; scriptId?: string }) {
  const actor = await authorize(db, auth, {
    roles: EDIT_ROLES,
    project: { id: input.projectId, access: 'edit' },
    product: { id: 'tpeasy', feature: 'script_import' },
  })
  let script: { id: string; title: string; body: string }
  try {
    script = scriptFromTpeasyBackup(input.backup, input.scriptId)
  } catch (e) {
    throw new DomainError('invalid_input', e instanceof Error ? e.message : 'Backup inválido.')
  }
  return db.asUser({ userId: actor.userId, orgId: actor.orgId }, async (tx) => {
    const doc = await addDocumentVersion(tx, actor, {
      projectId: input.projectId,
      kind: 'script',
      title: script.title,
      body: script.body,
      source: 'tpeasy',
      externalRef: script.id,
    })
    await setStepState(tx, {
      projectId: input.projectId,
      orgId: actor.orgId,
      stepKey: 'tpeasy',
      state: 'done',
      source: 'tpeasy backup v1',
      detail: { document_id: doc.id, version: doc.version },
    })
    await publishEvent(
      tx,
      {
        orgId: actor.orgId,
        projectId: input.projectId,
        type: 'script.ready',
        producer: 'tpeasy',
        payload: { document_id: doc.id, version: doc.version, title: script.title.slice(0, 200) },
        idempotencyKey: `script.ready:${doc.id}`,
        createdBy: actor.userId,
      },
      ROUTES,
    )
    await audit(tx, {
      orgId: actor.orgId,
      actorUserId: actor.userId,
      action: 'tpeasy.script_imported',
      targetType: 'project',
      targetId: input.projectId,
      metadata: { version: doc.version },
    })
    return doc
  })
}

// ───────────── Carro do Freela ─────────────

export async function importCarroJob(db: Database, auth: Authenticated | null, raw: unknown) {
  const actor = await authorize(db, auth, { roles: EDIT_ROLES, product: { id: 'carro-do-freela', feature: 'job_import' } })
  const parsed = CarroJobSchema.safeParse(raw)
  if (!parsed.success)
    throw new DomainError(
      'invalid_input',
      `Job fora do contrato carro-do-freela.job/1: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`,
    )
  const job = parsed.data
  const [existing] = await db.asUser(
    { userId: actor.userId, orgId: actor.orgId },
    (tx) => tx`
    select internal_id from zro.integration_links where org_id = ${actor.orgId} and product_id = 'carro-do-freela' and external_type = 'job' and external_id = ${job.job_id}`,
  )
  if (existing) return { projectId: existing.internal_id as string, created: false }
  const projectId = await createProjectAs(db, actor, projectInputFromJob(job), { origin: 'carro-do-freela' })
  await db.asUser({ userId: actor.userId, orgId: actor.orgId }, async (tx) => {
    await tx`insert into zro.integration_links (org_id, product_id, external_type, external_id, internal_type, internal_id, created_by)
             values (${actor.orgId}, 'carro-do-freela', 'job', ${job.job_id}, 'project', ${projectId}, ${actor.userId})`
    if (job.briefing)
      await addDocumentVersion(tx, actor, {
        projectId,
        kind: 'brief',
        title: job.title,
        body: job.briefing,
        source: 'carro-do-freela',
        externalRef: job.job_id,
      })
    await setStepState(tx, {
      projectId,
      orgId: actor.orgId,
      stepKey: 'carro-do-freela',
      state: 'done',
      source: 'carro-do-freela.job/1',
      detail: { job_id: job.job_id },
    })
    await publishEvent(
      tx,
      {
        orgId: actor.orgId,
        projectId,
        type: 'job.created',
        producer: 'carro-do-freela',
        payload: { product: 'carro-do-freela', external_job_id: job.job_id, title: job.title },
        idempotencyKey: `job.created:${job.job_id}`,
        createdBy: actor.userId,
      },
      ROUTES,
    )
  })
  return { projectId, created: true }
}

export type CrewStatus = 'na_equipe' | 'convidado' | 'convite_pendente'

/**
 * Equipe da escala → equipe do projeto (carro-do-freela.crew/1). Quem já é da organização entra direto no projeto;
 * conta da Absolute ZRO de fora recebe convite de convidado (guest), que só abre aquele projeto e só pode ser aceito
 * pela mesma conta. Ninguém ganha cadastro novo nem papel maior do que tinha. Os tokens de convite voltam só para
 * quem envia o e-mail (a rota), nunca na resposta ao app.
 */
export async function syncCarroCrew(db: Database, auth: Authenticated | null, raw: unknown) {
  const actor = await authorize(db, auth, {
    roles: ['owner', 'admin', 'manager'],
    verifiedEmail: true,
    product: { id: 'carro-do-freela', feature: 'job_import' },
  })
  const parsed = CarroCrewSchema.safeParse(raw)
  if (!parsed.success)
    throw new DomainError(
      'invalid_input',
      `Equipe fora do contrato carro-do-freela.crew/1: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`,
    )
  const crew = parsed.data
  const seen = new Set<string>()
  const people = crew.members.filter((m) => !seen.has(m.zro_user_id) && !!seen.add(m.zro_user_id))
  return db.asUser({ userId: actor.userId, orgId: actor.orgId }, async (tx) => {
    const [link] = await tx`
      select l.internal_id, p.title from zro.integration_links l join zro.projects p on p.id = l.internal_id
      where l.org_id = ${actor.orgId} and l.product_id = 'carro-do-freela' and l.external_type = 'job' and l.external_id = ${crew.job_id}`
    if (!link) throw new DomainError('not_found', 'Envie o job antes da equipe.')
    const projectId = link.internal_id as string
    const members: { zro_user_id: string; function: string; status: CrewStatus }[] = []
    const invites: { email: string; token: string }[] = []
    for (const m of people) {
      const [member] = await tx`select 1 from zro.memberships where org_id = ${actor.orgId} and user_id = ${m.zro_user_id} and status = 'active'`
      if (member) {
        await tx`insert into zro.project_members (project_id, user_id, role, function, added_by)
                 values (${projectId}, ${m.zro_user_id}, ${m.project_role}, ${m.function}, ${actor.userId})
                 on conflict (project_id, user_id) do nothing`
        members.push({ zro_user_id: m.zro_user_id, function: m.function, status: 'na_equipe' })
        continue
      }
      const [pending] = await tx`
        select 1 from zro.invitations where org_id = ${actor.orgId} and project_id = ${projectId} and invitee_user_id = ${m.zro_user_id}
          and accepted_at is null and revoked_at is null and expires_at > now()`
      if (pending) {
        members.push({ zro_user_id: m.zro_user_id, function: m.function, status: 'convite_pendente' })
        continue
      }
      const email = normalizeEmail(m.email)
      const token = newToken('zi')
      const [inv] = await tx`
        insert into zro.invitations (org_id, email, role, token_hash, invited_by, expires_at, project_id, project_role, project_function, invitee_user_id)
        values (${actor.orgId}, ${email}, 'guest', ${hashToken(token)}, ${actor.userId}, ${new Date(Date.now() + INVITE_TTL_MS)},
                ${projectId}, ${m.project_role}, ${m.function}, ${m.zro_user_id})
        returning id`
      await audit(tx, {
        orgId: actor.orgId,
        actorUserId: actor.userId,
        action: 'member.invited',
        targetType: 'invitation',
        targetId: inv!.id as string,
        metadata: { role: 'guest', project_id: projectId, source: 'carro-do-freela' },
      })
      invites.push({ email, token })
      members.push({ zro_user_id: m.zro_user_id, function: m.function, status: 'convidado' })
    }
    return { projectId, projectTitle: link.title as string, members, invites }
  })
}
