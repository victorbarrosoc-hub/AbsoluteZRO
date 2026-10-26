'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createProject, reprocessRun, saveDocument, updateProject } from '@zro/core'
import { HANDLERS, importCarroJob, importScriptFromTpeasy, importSobedesceDelivery, importSobedesceManifest, previewOrganizationPlan } from '@zro/integrations'
import { DomainError } from '@zro/observability'
import type { FormState } from '@/components/action-form'
import { drainQueueAfterResponse } from '../queue'
import { db, getAuth } from '../session'
import { str, toFormError } from './helpers'

const MAX_FILE = 20 * 1024 * 1024

async function fileText(fd: FormData, key: string): Promise<{ name: string; text: string }[]> {
  const out: { name: string; text: string }[] = []
  for (const f of fd.getAll(key)) {
    if (typeof f === 'string' || !f.size) continue
    if (f.size > MAX_FILE) throw new DomainError('invalid_input', `${f.name} passa de 20 MB.`)
    out.push({ name: f.name, text: await f.text() })
  }
  return out
}

export async function createProjectAction(_: FormState, fd: FormData): Promise<FormState> {
  let id: string
  try {
    id = await createProject(db(), await getAuth(), {
      title: str(fd, 'title'),
      type: str(fd, 'type') || 'outro',
      client_reference: str(fd, 'client') || null,
      visibility: str(fd, 'visibility') === 'restricted' ? 'restricted' : 'organization',
    })
  } catch (e) {
    return toFormError(e)
  }
  redirect(`/projetos/${id}`)
}

export async function updateProjectAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const id = str(fd, 'projectId')
    await updateProject(db(), await getAuth(), id, {
      title: str(fd, 'title') || undefined,
      status: str(fd, 'status') || undefined,
      client_reference: str(fd, 'client') || null,
    })
    revalidatePath(`/projetos/${id}`)
    return { ok: 'Projeto atualizado.' }
  } catch (e) {
    return toFormError(e)
  }
}

export async function saveDocumentAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const projectId = str(fd, 'projectId')
    const kind = str(fd, 'kind') === 'script' ? 'script' : 'brief'
    const doc = await saveDocument(db(), await getAuth(), { projectId, kind, title: str(fd, 'title'), body: String(fd.get('body') ?? '') })
    revalidatePath(`/projetos/${projectId}`)
    return { ok: `Versão ${doc.version} salva.` }
  } catch (e) {
    return toFormError(e)
  }
}

export async function importSobedesceAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const projectId = str(fd, 'projectId')
    const pasted = String(fd.get('descargasText') ?? '')
    const files = await fileText(fd, 'descargasFile')
    const descargas = files[0]?.text ?? pasted
    if (!descargas.trim()) throw new DomainError('invalid_input', 'Envie o descargas.jsonl ou cole o conteúdo.')
    const destinations = []
    for (const i of [1, 2, 3, 4]) {
      const label = str(fd, `dest${i}Label`)
      const reports = await fileText(fd, `dest${i}Reports`)
      if (!label && !reports.length) continue
      destinations.push({ id: `destino-${i}`, label: label || `Destino ${i}`, reports })
    }
    const r = await importSobedesceManifest(db(), await getAuth(), { projectId, descargas, destinations })
    drainQueueAfterResponse()
    revalidatePath(`/projetos/${projectId}`)
    if (r.duplicate) return { ok: 'Essa descarga já tinha sido importada. Nada foi duplicado.' }
    const s = r.summary
    return {
      ok: `Importado: ${s.assets_total} arquivo(s), ${s.verified_locations} cópia(s) conferida(s), ${s.unverified_locations} sem conferência. ${s.backup_complete ? 'Backup comprovado em todos os destinos.' : 'Backup ainda não comprovado em todos os destinos.'}`,
      data: r.issues,
    }
  } catch (e) {
    return toFormError(e)
  }
}

export async function importSobedesceDeliveryAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const projectId = str(fd, 'projectId')
    const entrega = (await fileText(fd, 'entregaFile'))[0]?.text ?? ''
    if (!entrega.trim()) throw new DomainError('invalid_input', 'Envie o comprovante da entrega (.json) que o SOBEDESCE gerou.')
    const r = await importSobedesceDelivery(db(), await getAuth(), { projectId, entrega })
    revalidatePath(`/projetos/${projectId}`)
    if (r.duplicate) return { ok: 'Essa entrega já estava registrada. Nada foi duplicado.' }
    return { ok: `Entrega registrada: ${r.files} arquivo(s), todos com MD5 conferido.` }
  } catch (e) {
    return toFormError(e)
  }
}

export async function previewPlanAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const r = await previewOrganizationPlan(db(), await getAuth(), { projectId: str(fd, 'projectId'), manifestRowId: str(fd, 'manifestRowId') })
    return { ok: `Prévia pronta: ${r.plan.preserved_asset_ids} arquivo(s), nada será movido.`, data: r.plan }
  } catch (e) {
    return toFormError(e)
  }
}

export async function importTpeasyAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const projectId = str(fd, 'projectId')
    const files = await fileText(fd, 'backup')
    if (!files[0]) throw new DomainError('invalid_input', 'Escolha o arquivo de backup do TPeasy.')
    let json: unknown
    try {
      json = JSON.parse(files[0].text)
    } catch {
      throw new DomainError('invalid_input', 'Esse arquivo não é um backup do TPeasy.')
    }
    const doc = await importScriptFromTpeasy(db(), await getAuth(), { projectId, backup: json, scriptId: str(fd, 'scriptId') || undefined })
    revalidatePath(`/projetos/${projectId}`)
    return { ok: `Roteiro importado como versão ${doc.version}.` }
  } catch (e) {
    return toFormError(e)
  }
}

export async function importCarroJobAction(_: FormState, fd: FormData): Promise<FormState> {
  let projectId: string
  try {
    let json: unknown
    try {
      json = JSON.parse(String(fd.get('job') ?? ''))
    } catch {
      throw new DomainError('invalid_input', 'Cole um JSON válido no formato carro-do-freela.job/1.')
    }
    projectId = (await importCarroJob(db(), await getAuth(), json)).projectId
  } catch (e) {
    return toFormError(e)
  }
  redirect(`/projetos/${projectId}`)
}

export async function reprocessAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const r = await reprocessRun(db(), await getAuth(), str(fd, 'runId'), HANDLERS)
    drainQueueAfterResponse()
    const back = str(fd, 'back')
    if (back.startsWith('/')) revalidatePath(back)
    return { ok: r.created ? 'Nova execução na fila.' : 'Essa execução já foi repetida; acompanhe a nova.' }
  } catch (e) {
    return toFormError(e)
  }
}
