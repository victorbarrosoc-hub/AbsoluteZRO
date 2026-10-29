/**
 * Synquei: prévia de organização a partir de um manifest validado (PRD §8 SOBEDESCE → Synquei).
 * Espelha o que o Synquei desktop faz hoje (products/synquei, desktop/organizador.cjs e README "Organizar"):
 * os originais nunca são movidos; ao redor são criadas Assets, Exports e Synquei/Sequências; no editor, bins por
 * diária, câmera e cartão. Sempre dry_run: nada é executado no disco pelo HUB.
 */
import { PreparoSchema, type OrganizationPlan, type Preparo, type ZroMediaManifest } from '@zro/media-contracts'

export const SYNQUEI_WORK_FOLDERS = ['Assets', 'Exports', 'Synquei/Sequências']

export function planOrganization(manifest: ZroMediaManifest, now = new Date()): OrganizationPlan {
  const warnings: string[] = []
  const cardName = manifest.context.card_folder?.split('/').pop() ?? 'Cartão'
  const day = manifest.context.day?.name ?? 'Diária'
  const owner = manifest.context.owner?.folder || [manifest.context.owner?.name, manifest.context.owner?.camera].filter(Boolean).join(' - ') || 'Câmera'
  const bin = `${day}/${owner}/${cardName}`
  if (manifest.verification_summary.unverified_locations > 0) {
    warnings.push('Parte das cópias não tem checksum conferido. Organize, mas não formate o cartão antes de conferir no SOBEDESCE.')
  }
  if (!manifest.verification_summary.backup_complete) warnings.push('Backup não comprovado em todos os destinos.')
  const seen = new Set<string>()
  const assets = manifest.assets.filter((a) => {
    if (seen.has(a.asset_id)) {
      warnings.push(`asset_id repetido ignorado: ${a.asset_id}`)
      return false
    }
    seen.add(a.asset_id)
    return true
  })
  return {
    schema_version: '1.0',
    dry_run: true,
    project_id: manifest.project_id,
    manifest_id: manifest.manifest_id,
    generated_at: now.toISOString(),
    generator: 'absolute-zro-hub/synquei-adapter@1',
    root_label: manifest.context.production ?? 'Projeto',
    create_folders: SYNQUEI_WORK_FOLDERS,
    bins: [{ bin, asset_ids: assets.map((a) => a.asset_id), camera: manifest.context.owner?.camera || null }],
    assets: assets.map((a) => ({ asset_id: a.asset_id, keep_path: a.relative_path, bin })),
    moves: [],
    preserved_asset_ids: assets.length,
    warnings,
  }
}

/**
 * Recibo do Synquei (`synquei.preparo/1`, `<pasta>/Synquei/preparos.jsonl`): uma linha por mudança de estado de cada
 * operação. Só linhas inteiras; linha fora do contrato fica de fora com o motivo. Produtor:
 * products/synquei/desktop/manifesto-drive.cjs (linhaRecibo).
 */
export type PreparosParse = { entries: Preparo[]; skipped: { line: number; reason: string }[]; partialTail: boolean }

export function parsePreparos(text: string): PreparosParse {
  const lines = text.split('\n')
  const tail = lines.pop() ?? ''
  const out: PreparosParse = { entries: [], skipped: [], partialTail: tail.trim().length > 0 }
  lines.forEach((raw, i) => {
    if (!raw.trim()) return
    if (raw.length > 64 * 1024) {
      out.skipped.push({ line: i + 1, reason: 'linha grande demais' })
      return
    }
    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch {
      out.skipped.push({ line: i + 1, reason: 'linha estragada (JSON inválido)' })
      return
    }
    const r = PreparoSchema.safeParse(json)
    if (!r.success) {
      const e = r.error.issues[0]
      out.skipped.push({ line: i + 1, reason: `fora do contrato synquei.preparo/1: ${e?.path.join('.')} ${e?.message}` })
      return
    }
    out.entries.push(r.data)
  })
  return out
}

/** O estado atual de uma operação: a última linha dela (null se o Synquei ainda não escreveu nada). */
export function ultimoPreparo(entries: Preparo[], op: string): Preparo | null {
  for (let i = entries.length - 1; i >= 0; i--) if (entries[i]!.op === op) return entries[i]!
  return null
}
