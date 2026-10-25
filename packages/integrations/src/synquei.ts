/**
 * Synquei: prévia de organização a partir de um manifest validado (PRD §8 SOBEDESCE → Synquei).
 * Espelha o que o Synquei desktop faz hoje (products/synquei, desktop/organizador.cjs e README "Organizar"):
 * os originais nunca são movidos; ao redor são criadas Assets, Exports e Synquei/Sequências; no editor, bins por
 * diária, câmera e cartão. Sempre dry_run: nada é executado no disco pelo HUB.
 */
import type { OrganizationPlan, ZroMediaManifest } from '@zro/media-contracts'

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
