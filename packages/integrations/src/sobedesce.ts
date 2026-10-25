/**
 * Adaptador SOBEDESCE → ZroMediaManifest (PRD §7.2, §8).
 *
 * Fonte real (products/sobedesce, commit 21f3a63):
 * - `<destino>/<Projeto>/.sobedesce/descargas.jsonl`: uma linha por cartão, v1 (src/backup/servico.js #resumir).
 *   Lista os arquivos do cartão (rel, size), sem checksum. A mesma linha vai para cada destino.
 * - `SOBEDESCE_copia_<data>.xxh64` (ou .md5) na pasta do cartão em cada destino (src/discos/servico.js):
 *   formato do xxhsum/md5sum, `<hex>  <caminho>`, só com o que foi gravado E conferido naquela leva.
 *
 * Regra de honestidade: destino só fica "verified" quando o relatório daquele destino traz o checksum do arquivo.
 * Sem relatório, o arquivo fica "unverified" (o SOBEDESCE listou, o HUB não tem prova da conferência).
 */
import { createHash } from 'node:crypto'
import {
  MANIFEST_SCHEMA_VERSION,
  type MediaAsset,
  type ZroMediaManifest,
} from '@zro/media-contracts'
import { z } from 'zod'

/** Mesmo limite do SOBEDESCE (RESUMO_MAX_ARQUIVOS): acima disso a linha vem truncada. */
export const SOBEDESCE_MAX_FILES = 50_000

export const DescargaSchema = z.object({
  v: z.literal(1),
  app: z.literal('sobedesce'),
  id: z.string().min(1).max(200),
  quando: z.string().min(1),
  data: z.string().nullable().optional(),
  projeto: z.string().max(200),
  diaria: z.object({ n: z.number().int().positive(), nome: z.string().max(120) }),
  dono: z.object({ id: z.string().optional(), nome: z.string().max(120), camera: z.string().max(120), pasta: z.string().max(200) }),
  cartao: z.object({ n: z.number().int().positive(), nome: z.string().max(200), volId: z.string().optional(), pasta: z.string().min(1).max(600) }),
  resultado: z.enum(['ok', 'falta', 'erro', 'cancelado']),
  copiados: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  arquivos: z.array(z.object({ rel: z.string().min(1).max(1024), size: z.number().int().nonnegative() })),
})
export type Descarga = z.infer<typeof DescargaSchema>

export type DescargasParse = { entries: Descarga[]; skipped: { line: number; reason: string }[]; partialTail: boolean }

/** Lê o descargas.jsonl como o Synquei lê (desktop/organizador.cjs): só linhas inteiras; cancelado fica de fora. */
export function parseDescargas(text: string): DescargasParse {
  const lines = text.split('\n')
  const tail = lines.pop() ?? ''
  const out: DescargasParse = { entries: [], skipped: [], partialTail: tail.trim().length > 0 }
  lines.forEach((raw, i) => {
    if (!raw.trim()) return
    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch {
      out.skipped.push({ line: i + 1, reason: 'linha estragada (JSON inválido)' })
      return
    }
    const r = DescargaSchema.safeParse(json)
    if (!r.success) {
      out.skipped.push({ line: i + 1, reason: `fora do contrato v1: ${r.error.issues[0]?.path.join('.')} ${r.error.issues[0]?.message}` })
      return
    }
    if (r.data.resultado === 'cancelado') {
      out.skipped.push({ line: i + 1, reason: 'descarga cancelada' })
      return
    }
    out.entries.push(r.data)
  })
  return out
}

export type ChecksumReport = { algorithm: 'xxh64' | 'md5'; entries: Map<string, string>; invalidLines: number; conflicts: string[] }

/** Relatório no formato do xxhsum/md5sum (GNU: `<hex>  <caminho>`, com `*` opcional de modo binário). */
export function parseChecksumReport(fileName: string, text: string): ChecksumReport {
  const algorithm = /\.md5$/i.test(fileName) ? 'md5' : 'xxh64'
  const size = algorithm === 'md5' ? 32 : 16
  const entries = new Map<string, string>()
  const conflicts: string[] = []
  let invalidLines = 0
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const m = /^([0-9a-fA-F]+) [ *](.+)$/.exec(line)
    if (!m || m[1]!.length !== size) {
      invalidLines++
      continue
    }
    const hex = m[1]!.toLowerCase()
    const p = m[2]!.replace(/\\/g, '/')
    const prev = entries.get(p)
    if (prev && prev !== hex) conflicts.push(p)
    entries.set(p, hex)
  }
  return { algorithm, entries, invalidLines, conflicts }
}

export type DestinationInput = { id: string; label: string; reports: { name: string; text: string }[] }

const safeId = (s: string) => /^[a-z0-9][a-z0-9-]{0,62}$/.test(s)

/** ID estável do ativo: mesmo arquivo do mesmo cartão = mesmo ID, em qualquer destino e reimportação. */
export function sobedesceAssetId(projeto: string, cardFolder: string, rel: string): string {
  const h = createHash('sha256').update(`${projeto}\u0000${cardFolder}\u0000${rel}`).digest('base64url').slice(0, 22)
  return `sobedesce:${h}`
}

function isSafeRelative(p: string): boolean {
  return !!p && !p.startsWith('/') && !/^[A-Za-z]:/.test(p) && !p.includes('\\') && !p.split('/').some((s) => s === '..' || s === '')
}

export function buildSobedesceManifest(input: {
  projectId: string
  entry: Descarga
  destinations: DestinationInput[]
  now?: Date
}): ZroMediaManifest {
  const { entry } = input
  const now = input.now ?? new Date()
  const warnings: string[] = []
  if (!input.destinations.length) warnings.push('Nenhum destino informado: o HUB não tem como comprovar onde estão as cópias.')
  for (const d of input.destinations) if (!safeId(d.id)) throw new Error(`id de destino inválido: ${d.id}`)
  if (!isSafeRelative(entry.cartao.pasta)) throw new Error('cartao.pasta precisa ser um caminho relativo seguro')

  const reports = input.destinations.map((d) => {
    const parsed = d.reports.map((r) => ({ name: r.name, ...parseChecksumReport(r.name, r.text) }))
    for (const p of parsed) {
      if (p.invalidLines) warnings.push(`${d.label}: ${p.invalidLines} linha(s) ilegível(is) em ${p.name}.`)
    }
    return { dest: d, parsed }
  })
  if (entry.arquivos.length >= SOBEDESCE_MAX_FILES) warnings.push(`O resumo do SOBEDESCE lista no máximo ${SOBEDESCE_MAX_FILES} arquivos; este cartão pode ter mais.`)
  if (input.destinations.length && reports.every((r) => r.parsed.length === 0)) {
    warnings.push('Nenhum relatório de checksum foi enviado: as cópias aparecem como não conferidas.')
  }

  const assets: MediaAsset[] = []
  const known = new Set<string>()
  for (const f of entry.arquivos) {
    const rel = f.rel.replace(/\\/g, '/')
    const relativePath = `${entry.cartao.pasta}/${rel}`
    const assetWarnings: string[] = []
    if (!isSafeRelative(rel)) {
      warnings.push(`Arquivo ignorado por caminho inseguro: ${rel.slice(0, 120)}`)
      continue
    }
    known.add(rel)
    const destinations = reports.map(({ dest, parsed }) => {
      const hits = parsed.flatMap((p) => {
        const hex = p.entries.get(rel)
        return hex ? [{ algorithm: p.algorithm, value: hex, report: p.name, conflict: p.conflicts.includes(rel) }] : []
      })
      const sameAlg = new Map<string, Set<string>>()
      for (const h of hits) {
        if (!sameAlg.has(h.algorithm)) sameAlg.set(h.algorithm, new Set())
        sameAlg.get(h.algorithm)!.add(h.value)
      }
      const divergent = [...sameAlg.values()].some((s) => s.size > 1) || hits.some((h) => h.conflict)
      const best = hits.find((h) => h.algorithm === 'xxh64') ?? hits[0]
      return {
        destination_id: dest.id,
        uri: `zro-dest://${dest.id}/${encodeURI(relativePath)}`,
        status: divergent ? ('mismatch' as const) : best ? ('verified' as const) : ('unverified' as const),
        checksum: best ? { algorithm: best.algorithm, value: best.value } : null,
        verified_at: best && !divergent ? entry.quando : null,
        evidence: best ? best.report : null,
      }
    })
    if (destinations.some((d) => d.status === 'mismatch')) assetWarnings.push('checksums diferentes entre relatórios do mesmo destino')
    const checksums = new Map<string, { algorithm: 'xxh64' | 'md5' | 'sha256'; value: string }>()
    for (const d of destinations) if (d.checksum) checksums.set(`${d.checksum.algorithm}:${d.checksum.value}`, d.checksum)
    assets.push({
      asset_id: sobedesceAssetId(entry.projeto, entry.cartao.pasta, rel),
      original_name: rel.split('/').pop()!,
      relative_path: relativePath,
      size_bytes: f.size,
      mime_detected: null,
      media: {},
      source: { kind: 'card', label: entry.cartao.nome || `Cartão ${String(entry.cartao.n).padStart(2, '0')}` },
      camera: entry.dono.camera || null,
      card: entry.cartao.nome || null,
      checksums: [...checksums.values()],
      destinations,
      warnings: assetWarnings,
    })
  }
  for (const { dest, parsed } of reports) {
    const extra = parsed.flatMap((p) => [...p.entries.keys()]).filter((k) => !known.has(k))
    if (extra.length) warnings.push(`${dest.label}: ${extra.length} arquivo(s) no relatório que não estão no resumo deste cartão (outra leva ou outra pasta).`)
  }

  const locations = assets.flatMap((a) => a.destinations)
  const verified = locations.filter((l) => l.status === 'verified').length
  const unverified = locations.filter((l) => l.status === 'unverified').length
  const mismatched = locations.filter((l) => l.status === 'mismatch').length
  const fullyVerified = assets.filter((a) => a.destinations.length > 0 && a.destinations.every((d) => d.status === 'verified')).length
  const result = { ok: 'ok', falta: 'missing_files', erro: 'error', cancelado: 'canceled' }[entry.resultado] as 'ok' | 'missing_files' | 'error' | 'canceled'

  return {
    manifest_id: `sobedesce:${entry.id}`,
    schema_version: MANIFEST_SCHEMA_VERSION,
    project_id: input.projectId,
    source_app: 'sobedesce',
    source_app_contract: 'sobedesce.descargas.jsonl/v1 + SOBEDESCE_copia_*.xxh64',
    created_at: now.toISOString(),
    job_id: entry.id,
    context: {
      production: entry.projeto || null,
      day: { n: entry.diaria.n, name: entry.diaria.nome, date: entry.data ?? null },
      owner: { name: entry.dono.nome, camera: entry.dono.camera, folder: entry.dono.pasta },
      card_folder: entry.cartao.pasta,
    },
    assets,
    copy_operations: [
      {
        operation_id: entry.id,
        started_at: null,
        finished_at: entry.quando,
        result,
        files_listed: entry.arquivos.length,
        files_copied: entry.copiados,
        bytes_copied: entry.bytes,
        destinations: input.destinations.map((d) => ({ destination_id: d.id, label: d.label, report_files: d.reports.map((r) => r.name) })),
        source_note: entry.resultado === 'ok' ? null : `SOBEDESCE informou "${entry.resultado}" nesta descarga.`,
      },
    ],
    verification_summary: {
      assets_total: assets.length,
      destinations_total: input.destinations.length,
      verified_locations: verified,
      unverified_locations: unverified,
      mismatched_locations: mismatched,
      missing_locations: 0,
      fully_verified_assets: fullyVerified,
      backup_complete: result === 'ok' && assets.length > 0 && input.destinations.length > 0 && fullyVerified === assets.length,
    },
    warnings,
  }
}
