/**
 * TPeasy ↔ HUB pelo backup JSON do próprio app (products/tpeasy, app/js/data.js exportAll/importAll v1).
 * Exportamos só `scripts` (sem prefs nem sessions), então importar no TPeasy não mexe nos ajustes do aparelho.
 * O id é estável por projeto: exportar uma versão nova atualiza o mesmo roteiro no TPeasy ("o mais novo vence").
 */
import { TpeasyBackupSchema, type TpeasyBackup } from '@zro/media-contracts'

export function tpeasyScriptId(projectId: string): string {
  return `zro-${projectId}`
}

export function toTpeasyBackup(input: { projectId: string; title: string; body: string; updatedAt: Date }): TpeasyBackup {
  return {
    app: 'tpeasy',
    version: 1,
    exportedAt: new Date().toISOString(),
    scripts: [{ id: tpeasyScriptId(input.projectId), title: input.title, body: input.body, updated: input.updatedAt.getTime(), pos: 0, fav: false, target: 0 }],
  }
}

export function scriptFromTpeasyBackup(raw: unknown, scriptId?: string): { id: string; title: string; body: string } {
  const r = TpeasyBackupSchema.safeParse(raw)
  if (!r.success) throw new Error('Esse arquivo não é um backup do TPeasy.')
  const live = r.data.scripts.filter((s) => !s.deleted && s.body.trim())
  const pick = scriptId ? live.find((s) => s.id === scriptId) : live.length === 1 ? live[0] : undefined
  if (!pick) throw new Error(scriptId ? 'Roteiro não encontrado no backup.' : `O backup tem ${live.length} roteiros. Escolha qual importar.`)
  return { id: pick.id, title: pick.title || 'Roteiro', body: pick.body }
}

/** Blocos (`# título`) e marcações, como o TPeasy lê (blocksOf / stripForReading). */
export function tpeasyBlocks(body: string): string[] {
  return body.split('\n').flatMap((l) => {
    const m = /^\s*#+\s*(.+)$/.exec(l)
    return m ? [m[1]!.trim()] : []
  })
}
